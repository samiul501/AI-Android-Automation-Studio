import { Router } from 'express'
import { executionManager, ExecutionAlreadyActiveError, NoActiveExecutionError } from '../services/execution/manager.js'
import type { ScriptLanguage } from '../services/scriptgen/types.js'
import { logger } from '../config/logger.js'

export const executionRouter = Router()

interface ScriptRef {
  language: ScriptLanguage
  fileName: string
}

function isValidScriptRef(value: unknown): value is ScriptRef {
  if (typeof value !== 'object' || value === null) return false
  const ref = value as Record<string, unknown>
  return (
    (ref.language === 'typescript' || ref.language === 'javascript') &&
    typeof ref.fileName === 'string' &&
    ref.fileName.length > 0
  )
}

executionRouter.post('/execution/run', async (req, res) => {
  const scripts = req.body?.scripts

  if (!Array.isArray(scripts) || scripts.length === 0 || !scripts.every(isValidScriptRef)) {
    res.status(400).json({ error: 'scripts must be a non-empty array of { language, fileName }' })
    return
  }

  try {
    const session = await executionManager.start(scripts)
    res.status(201).json(session)
  } catch (error) {
    if (error instanceof ExecutionAlreadyActiveError) {
      res.status(409).json({ error: error.message })
      return
    }
    logger.error('Failed to start execution', { error: String(error) })
    res.status(500).json({ error: 'Failed to start execution' })
  }
})

executionRouter.post('/execution/stop', (_req, res) => {
  try {
    res.json(executionManager.stop())
  } catch (error) {
    if (error instanceof NoActiveExecutionError) {
      res.status(409).json({ error: error.message })
      return
    }
    logger.error('Failed to stop execution', { error: String(error) })
    res.status(500).json({ error: 'Failed to stop execution' })
  }
})

executionRouter.get('/execution/active', (_req, res) => {
  res.json({ session: executionManager.getActive() })
})

executionRouter.get('/execution', async (_req, res) => {
  try {
    res.json(await executionManager.list())
  } catch (error) {
    logger.error('Failed to list executions', { error: String(error) })
    res.status(500).json({ error: 'Failed to list executions' })
  }
})

executionRouter.get('/execution/:id', async (req, res) => {
  try {
    const session = await executionManager.get(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'Execution not found' })
      return
    }
    res.json(session)
  } catch (error) {
    logger.error('Failed to read execution', { error: String(error) })
    res.status(500).json({ error: 'Failed to read execution' })
  }
})
