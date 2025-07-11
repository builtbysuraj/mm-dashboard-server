import csvParser from 'csv-parser'
import fs from 'fs'
import { unlink } from 'fs/promises'

import { OutputLimit } from '../models/output-limit.model.js'
import { toCamelCase } from '../utils/index.js'
import { parse } from 'date-fns'

export async function outputLimitCsvParseAndSave(req, res) {
  const requiredFields = [
    'sno',
    'companyName',
    'distributorCode',
    'city',
    'state',
    'lender',
    'limitExpiryDate',
    'sanctionLimit',
    'operativeLimit',
    'utilisedLimit',
    'availableLimit',
    'overdue',
    'billingStatus',
  ]

  if (!req.file?.path) {
    return res.status(400).json({ message: 'No file uploaded' })
  }
  const filePath = req.file.path
  const rows = []
  let insertedDocs // To store the inserted documents if successful

  try {
    // 1) Parse CSV into rows[]
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(
          csvParser({
            mapHeaders: ({ header }) => toCamelCase(header),
          })
        )
        .on('data', (row) => rows.push(row))
        .on('end', resolve)
        .on('error', reject)
    })

    if (rows.length === 0) {
      return res.status(400).json({ message: 'CSV is empty' })
    }

    // 2) Header validation
    const csvFields = Object.keys(rows[0])
    const missing = requiredFields.filter((f) => !csvFields.includes(f))
    const extra = csvFields.filter((f) => !requiredFields.includes(f))
    if (missing.length || extra.length) {
      return res.status(400).json({
        message: 'CSV header mismatch',
        missingFields: missing,
        extraFields: extra,
      })
    }

    // 3) Check for duplicate distributorCodes within CSV
    const distributorCodesInCSV = rows.map((r) => r.distributorCode)
    const duplicateCodesInCSV = distributorCodesInCSV.filter(
      (item, index) => distributorCodesInCSV.indexOf(item) !== index
    )
    if (duplicateCodesInCSV.length) {
      return res.status(400).json({
        message: 'Duplicate Distributor Codes found in CSV',
        duplicates: [...new Set(duplicateCodesInCSV)], // Use Set to get unique duplicates
      })
    }

    // 4) Cast & prepare documents
    const toInsert = rows.map((r) => {
      // Clean and parse numbers
      const sno = Number(r.sno)
      const sanctionLimit = Number(r.sanctionLimit.replace(/,/g, ''))
      const operativeLimit = Number(r.operativeLimit.replace(/,/g, ''))
      const utilisedLimit = Number(r.utilisedLimit.replace(/,/g, ''))
      const availableLimit = Number(r.availableLimit.replace(/,/g, ''))
      const overdue = Number(r.overdue.replace(/,/g, ''))
      const billingStatus = r.billingStatus
      const limitExpiryDate = parse(r.limitExpiryDate, 'dd-MM-yy', new Date())

      // Validation
      if (
        isNaN(sno) ||
        isNaN(sanctionLimit) ||
        isNaN(operativeLimit) ||
        isNaN(utilisedLimit) ||
        isNaN(availableLimit) ||
        isNaN(overdue) ||
        isNaN(limitExpiryDate.getDate())
      ) {
        throw new Error('Invalid data types in CSV')
      }

      return {
        ...r,
        sno,
        sanctionLimit,
        operativeLimit,
        utilisedLimit,
        availableLimit,
        overdue,
        billingStatus,
        limitExpiryDate,
      }
    })

    // 5) Clear previous data
    await OutputLimit.deleteMany({})

    // 6) Insert into Mongo
    insertedDocs = await OutputLimit.insertMany(toInsert)

    res.json({
      message: 'File parsed and saved successfully',
      insertedCount: insertedDocs.length,
    })
  } catch (err) {
    console.error('Error processing CSV and saving data:', err)
    res
      .status(500)
      .json({ message: 'Failed to process CSV', error: err.message })
  } finally {
    try {
      await unlink(filePath)
      console.log(`Temporary file ${filePath} deleted.`)
    } catch (unlinkErr) {
      console.warn('Failed to delete temp file:', unlinkErr)
    }
  }
}

export const getOutputLimitData = async (req, res) => {
  const user = req.user
  console.log({ user })
  if (user.role === 'superAdmin' || user.role === 'admin') {
    const page = Number(req.query.page || 1)
    const limit = Number(req.query.limit || 10)
    const companyName = String(req.query.companyName || '')
    const distributorCode = String(req.query.distributorCode || '')
    const anchorId = String(req.query.anchorId || '')

    try {
      const filter = {}
      if (user.role === 'admin') {
        //anchor level view data control
        filter.anchorId = user.companyId
      }
      if (anchorId) filter.anchorId = new RegExp(anchorId, 'i')
      if (companyName) filter.companyName = new RegExp(companyName, 'i')
      if (distributorCode)
        filter.distributorCode = new RegExp(distributorCode, 'i')

      console.log('mongodb filter', filter)

      // First get the total count
      const total = await OutputLimit.countDocuments(filter)
      const totalPages = Math.ceil(total / limit)

      // Then validate page number
      if (page > totalPages && total > 0) {
        return res.status(400).json({
          message: `Page ${page} does not exist. Total pages: ${totalPages}`,
          data: [],
          total,
          totalPages,
          page,
          skip: 0,
        })
      }

      const skip = (page - 1) * limit

      // Then get the data
      const data = await OutputLimit.find(filter, {
        createdAt: 0,
        updatedAt: 0,
        __v: 0,
        sno: 0,
      })
        .skip(skip)
        .limit(limit)

      console.log(data)

      res.status(200).json({
        message: 'Credit limit data fetched successfully',
        data,
        page,
        totalPages,
        total,
        skip,
      })
    } catch (err) {
      console.error('Error in getOutputLimitData:', err)
      res.status(500).json({ message: 'Server error' })
    }
  } else {
    res.status(403).json({ message: 'Forbidden: Insufficient role' })
  }
}
