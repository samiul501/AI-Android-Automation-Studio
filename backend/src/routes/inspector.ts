import { Router } from 'express'
import { inspectorFetch, ensureInspectorDeviceSelected } from '../services/inspector.js'
import { logger } from '../config/logger.js'

export const inspectorRouter = Router()

inspectorRouter.get('/inspector/inspect', async (_req, res) => {
  try {
    const serial = await ensureInspectorDeviceSelected()
    if (!serial) {
      res.status(409).json({ error: 'No connected, authorized Android device found.' })
      return
    }
    const upstream = await inspectorFetch('/api/inspect')
    res.status(upstream.status).json(await upstream.json())
  } catch (error) {
    logger.error('Inspector inspect proxy failed', { error: String(error) })
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to inspect device' })
  }
})
