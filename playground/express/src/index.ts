import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { flowgladRouter } from './routes/flowglad'

dotenv.config()

const app = express()
const port = process.env.PORT || 8000

app.use(cors())
app.use(express.json())

// Mount the flowglad router
app.use('/api/flowglad', flowgladRouter)

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
