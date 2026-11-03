import { Router } from 'express'
import { checkMobilewrightReadiness } from '../services/mobilewrightDoctor.js'
import { logger } from '../config/logger.js'

export const automationRouter = Router()

automationRouter.get('/automation/mobilewright-status', async (_req, res) => {
  try {
    const readiness = await checkMobilewrightReadiness()
    res.json(readiness)
  } catch (error) {
    logger.error('Failed to check Mobilewright readiness', { error: String(error) })
    res.status(500).json({ error: 'Failed to check Mobilewright readiness' })
  }
})
