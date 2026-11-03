import { Router } from 'express'
import { recordingManager, RecordingAlreadyActiveError, NoActiveRecordingError } from '../services/recording/manager.js'
import { checkDeviceStatus } from '../services/deviceManager.js'
import { logger } from '../config/logger.js'

export const recordingRouter = Router()

async function resolveTargetSerial(requestedSerial: unknown): Promise<string> {
  if (typeof requestedSerial === 'string' && requestedSerial.length > 0) return requestedSerial

  const status = await checkDeviceStatus()
  if (status.connectionState !== 'connected' || !status.primaryDevice) {
    throw new Error('No connected, authorized Android device found. Connect a device or pass an explicit serial.')
  }
  return status.primaryDevice.serial
}

recordingRouter.post('/recording/start', async (req, res) => {
  try {
    const serial = await resolveTargetSerial(req.body?.serial)
    const session = await recordingManager.start(serial)
    res.status(201).json(session)
  } catch (error) {
    if (error instanceof RecordingAlreadyActiveError) {
      res.status(409).json({ error: error.message })
      return
    }
    logger.error('Failed to start recording', { error: String(error) })
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to start recording' })
  }
})

recordingRouter.post('/recording/stop', async (_req, res) => {
  try {
    const session = await recordingManager.stop()
    res.json(session)
  } catch (error) {
    if (error instanceof NoActiveRecordingError) {
      res.status(409).json({ error: error.message })
      return
    }
    logger.error('Failed to stop recording', { error: String(error) })
    res.status(500).json({ error: 'Failed to stop recording' })
  }
})

recordingRouter.get('/recording/active', (_req, res) => {
  res.json({ session: recordingManager.getActive() })
})

recordingRouter.get('/recording', async (_req, res) => {
  try {
    res.json(await recordingManager.list())
  } catch (error) {
    logger.error('Failed to list recordings', { error: String(error) })
    res.status(500).json({ error: 'Failed to list recordings' })
  }
})

recordingRouter.get('/recording/:id', async (req, res) => {
  try {
    const session = await recordingManager.get(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'Recording not found' })
      return
    }
    res.json(session)
  } catch (error) {
    logger.error('Failed to read recording', { error: String(error) })
    res.status(500).json({ error: 'Failed to read recording' })
  }
})
