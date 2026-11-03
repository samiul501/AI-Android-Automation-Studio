import { Router } from 'express'
import { resolve } from 'node:path'
import { analyzeFailure, AiNotConfiguredError, AiRefusedError } from '../services/ai/claudeClient.js'
import { readScript, saveScript } from '../services/scriptgen/fileStore.js'
import { backupScript } from '../services/scriptgen/versions.js'
import type { ScriptLanguage } from '../services/scriptgen/types.js'
import { executionManager } from '../services/execution/manager.js'
import { checkDeviceStatus } from '../services/deviceManager.js'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'

const GENERATED_TESTS_DIR = resolve(process.cwd(), env.generatedTestsDir)

export const aiRouter = Router()

function isValidLanguage(value: unknown): value is ScriptLanguage {
  return value === 'typescript' || value === 'javascript'
}

// Analyzing a failure needs the script source, the failing step/error, the
// device it ran on, and recent logs - all gathered here, not left to the client.
aiRouter.post('/ai/analyze-failure', async (req, res) => {
  const { executionId, itemIndex } = req.body ?? {}

  if (typeof executionId !== 'string' || typeof itemIndex !== 'number') {
    res.status(400).json({ error: 'executionId (string) and itemIndex (number) are required' })
    return
  }

  try {
    const session = await executionManager.get(executionId)
    if (!session) {
      res.status(404).json({ error: 'Execution not found' })
      return
    }
    const item = session.items[itemIndex]
    if (!item) {
      res.status(404).json({ error: 'Execution item not found' })
      return
    }

    const scriptCode = await readScript(GENERATED_TESTS_DIR, item.language, item.fileName)
    if (scriptCode === null) {
      res.status(404).json({ error: 'Script for this execution item was not found on disk' })
      return
    }

    const failedStep = [...item.steps].reverse().find((step) => step.status === 'failed')
    const deviceStatus = await checkDeviceStatus().catch(() => null)

    const analysis = await analyzeFailure({
      scriptFileName: item.fileName,
      scriptCode,
      failedStepTitle: failedStep?.title ?? item.currentStepTitle,
      errorMessage: item.error ?? 'The test failed with no captured error message.',
      deviceInfo: deviceStatus?.primaryDevice
        ? {
            model: [deviceStatus.primaryDevice.manufacturer, deviceStatus.primaryDevice.model]
              .filter(Boolean)
              .join(' '),
            androidVersion: deviceStatus.primaryDevice.androidVersion,
            apiLevel: deviceStatus.primaryDevice.apiLevel,
          }
        : undefined,
      recentLogs: item.logs,
    })

    res.json(analysis)
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      res.status(400).json({ error: error.message })
      return
    }
    if (error instanceof AiRefusedError) {
      res.status(502).json({ error: error.message })
      return
    }
    logger.error('AI failure analysis failed', { error: String(error) })
    res.status(500).json({ error: 'Failed to analyze failure' })
  }
})

// Applies a fix the user has already reviewed. Never called automatically -
// always backs up the current script first, per the "never overwrite without
// confirmation" rule.
aiRouter.post('/ai/apply-fix', async (req, res) => {
  const { language, fileName, code } = req.body ?? {}

  if (!isValidLanguage(language)) {
    res.status(400).json({ error: 'language must be "typescript" or "javascript"' })
    return
  }
  if (typeof fileName !== 'string' || typeof code !== 'string') {
    res.status(400).json({ error: 'fileName and code (strings) are required' })
    return
  }

  try {
    const backupFileName = await backupScript(GENERATED_TESTS_DIR, language, fileName)
    await saveScript(GENERATED_TESTS_DIR, language, fileName, code)
    res.json({ fileName, language, code, backupFileName })
  } catch (error) {
    logger.error('Failed to apply AI fix', { error: String(error) })
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to apply fix' })
  }
})
