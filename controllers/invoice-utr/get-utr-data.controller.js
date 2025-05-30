import { parse } from 'date-fns'

import { OutputUTR } from '../../models/output-utr.model.js'

export const getOutputUtrData = async (req, res) => {
  try {
    const {
      companyName,
      invoiceNumber,
      distributorCode,
      utr,
      fromDate,
      toDate,
      status,
      page = 1,
      limit = 10,
    } = req.query

    const filter = {}

    if (companyName) {
      filter.companyName = new RegExp(companyName, 'i')
    }
    if (invoiceNumber) {
      // Convert number field to string and do partial matching
      filter.$expr = {
        $regexMatch: {
          input: { $toString: '$invoiceNumber' },
          regex: invoiceNumber,
          options: 'i',
        },
      }
    }
    if (distributorCode) {
      filter.distributorCode = new RegExp(distributorCode, 'i')
    }
    if (utr) {
      filter.utr = new RegExp(utr, 'i')
    }
    if (status) {
      filter.status = new RegExp(status, 'i')
    }

    if (fromDate || toDate) {
      const dateFilter = {}

      if (fromDate) {
        const from = parse(fromDate, 'dd-MM-yyyy', new Date())
        dateFilter.$gte = from
      }

      if (toDate) {
        const to = parse(toDate, 'dd-MM-yyyy', new Date())
        to.setHours(23, 59, 59, 999)
        dateFilter.$lte = to
      }

      filter.invoiceDate = dateFilter
    }

    const skip = (Number(page) - 1) * Number(limit)

    const data = await OutputUTR.find(filter)
      .skip(skip)
      .limit(Number(limit))
      .sort({ invoiceDate: -1 })

    const total = await OutputUTR.countDocuments(filter)

    res.status(200).json({
      message: 'Fetched output UTR data successfully',
      data,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    })
  } catch (error) {
    console.error('Error fetching OutputUTR data:', error)
    res.status(500).json({ message: 'Internal server error' })
  }
}
