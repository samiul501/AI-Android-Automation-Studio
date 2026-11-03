import { Router } from 'express'
import { resetSystem } from '../services/systemReset.js'
import { logger } from '../config/logger.js'

export const systemRouter = Router()

// Irreversible: wipes all recordings, generated scripts, and reports, and
// stops any in-flight recording/execution. The client is expected to have
// already gotten explicit user confirmation before calling this.
systemRouter.post('/system/reset', async (_req, res) => {
  try {
    await resetSystem()
    res.json({ ok: true })
  } catch (error) {
    logger.error('Failed to reset system', { error: String(error) })
    res.status(500).json({ error: 'Failed to reset system' })
  }
})
