import { app } from './app.js'
import { connectDB } from './db.js'

const PORT = process.env.PORT || 8080 // Use 8080 as fallback

connectDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`)
    })
  })
  .catch((err) => {
    console.error('DB connection failed:', err)
    process.exit(1)
  })
