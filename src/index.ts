import './config/env'
import express from 'express'
import { env } from './config/env'
import { webhookRouter } from './routes/webhook'
import { logger } from './utils/logger'

export const app = express()

app.use(express.json())
app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/webhook', webhookRouter)

if (require.main === module) {
  app.listen(Number(env.PORT), () => logger.info(`Server running on port ${env.PORT}`))
}

export default app
