import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { healthRouter } from './routes/health.js'
import { deviceRouter } from './routes/device.js'
import { automationRouter } from './routes/automation.js'
import { recordingRouter } from './routes/recording.js'
import { scriptsRouter } from './routes/scripts.js'
import { executionRouter } from './routes/execution.js'
import { aiRouter } from './routes/ai.js'
import { documentsRouter } from './routes/documents.js'
import { reportsRouter } from './routes/reports.js'
import { systemRouter } from './routes/system.js'
import { inspectorRouter } from './routes/inspector.js'
import { initWebSocketServer } from './websocket/index.js'
import { closeInspectorServer } from './services/inspector.js'

const app = express()

app.use(cors({ origin: env.corsOrigin }))
app.use(express.json())

app.use('/api', healthRouter)
app.use('/api', deviceRouter)
app.use('/api', automationRouter)
app.use('/api', recordingRouter)
app.use('/api', scriptsRouter)
app.use('/api', executionRouter)
app.use('/api', aiRouter)
app.use('/api', documentsRouter)
app.use('/api', reportsRouter)
app.use('/api', systemRouter)
app.use('/api', inspectorRouter)

// Execution failure screenshots, served for display in the UI.
app.use('/screenshots', express.static(resolve(process.cwd(), env.screenshotsDir)))

const httpServer = createServer(app)
initWebSocketServer(httpServer)

httpServer.listen(env.port, () => {
  logger.info(`Backend listening on port ${env.port}`, { nodeEnv: env.nodeEnv })
})

async function shutdown(): Promise<void> {
  await closeInspectorServer().catch((error) => logger.warn('Failed to close inspector server', { error: String(error) }))
  httpServer.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
