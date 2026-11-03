import { Router } from 'express'
import { checkDeviceStatus, disconnectDevice } from '../services/deviceManager.js'
import { AdbNotFoundError } from '../services/adb.js'
import { logger } from '../config/logger.js'

export const deviceRouter = Router()

deviceRouter.get('/device/status', async (_req, res) => {
  try {
    const status = await checkDeviceStatus()
    res.json(status)
  } catch (error) {
    logger.error('Unexpected error handling /device/status', { error: String(error) })
    res.status(500).json({ error: 'Failed to check device status' })
  }
})

// Runs a real `adb disconnect`, then re-checks device status so the client
// reflects whatever adb actually reports - not an assumed outcome. On
// USB-attached devices adb has nothing to tear down, so this commonly
// returns a "no such device" message from adb itself rather than success.
deviceRouter.post('/device/disconnect', async (req, res) => {
  const serial = req.body?.serial
  if (serial !== undefined && typeof serial !== 'string') {
    res.status(400).json({ error: 'serial must be a string if provided' })
    return
  }

  try {
    const result = await disconnectDevice(serial)
    const status = await checkDeviceStatus()
    res.json({ ...result, status })
  } catch (error) {
    if (error instanceof AdbNotFoundError) {
      res.status(400).json({ error: error.message })
      return
    }
    logger.error('Failed to disconnect device', { error: String(error) })
    res.status(500).json({ error: 'Failed to disconnect device' })
  }
})
