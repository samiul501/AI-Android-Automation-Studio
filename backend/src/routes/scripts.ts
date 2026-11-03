import { Router } from 'express'
import { resolve } from 'node:path'
import { generateScript } from '../services/scriptgen/generator.js'
import { listScripts, readScript, saveScript } from '../services/scriptgen/fileStore.js'
import type { ScriptLanguage } from '../services/scriptgen/types.js'
import { recordingManager } from '../services/recording/manager.js'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'

const GENERATED_TESTS_DIR = resolve(process.cwd(), env.generatedTestsDir)

export const scriptsRouter = Router()

function isValidLanguage(value: unknown): value is ScriptLanguage {
  return value === 'typescript' || value === 'javascript'
}

scriptsRouter.post('/scripts/generate', async (req, res) => {
  const { recordingId, language, testName } = req.body ?? {}

  if (!isValidLanguage(language)) {
    res.status(400).json({ error: 'language must be "typescript" or "javascript"' })
    return
  }
  if (typeof recordingId !== 'string' || recordingId.length === 0) {
    res.status(400).json({ error: 'recordingId is required' })
    return
  }

  try {
    const recording = await recordingManager.get(recordingId)
    if (!recording) {
      res.status(404).json({ error: 'Recording not found' })
      return
    }

    const script = generateScript(recording, {
      language,
      testName: typeof testName === 'string' ? testName : undefined,
    })
    await saveScript(GENERATED_TESTS_DIR, script.language, script.fileName, script.code)
    res.status(201).json(script)
  } catch (error) {
    logger.error('Failed to generate script', { error: String(error) })
    res.status(500).json({ error: 'Failed to generate script' })
  }
})

scriptsRouter.get('/scripts', async (_req, res) => {
  try {
    res.json(await listScripts(GENERATED_TESTS_DIR))
  } catch (error) {
    logger.error('Failed to list scripts', { error: String(error) })
    res.status(500).json({ error: 'Failed to list scripts' })
  }
})

scriptsRouter.get('/scripts/:language/:fileName', async (req, res) => {
  const { language, fileName } = req.params
  if (!isValidLanguage(language)) {
    res.status(400).json({ error: 'Invalid language' })
    return
  }

  try {
    const code = await readScript(GENERATED_TESTS_DIR, language, fileName)
    if (code === null) {
      res.status(404).json({ error: 'Script not found' })
      return
    }
    res.json({ fileName, language, code })
  } catch (error) {
    logger.error('Failed to read script', { error: String(error) })
    res.status(500).json({ error: 'Failed to read script' })
  }
})

scriptsRouter.put('/scripts/:language/:fileName', async (req, res) => {
  const { language, fileName } = req.params
  const { code } = req.body ?? {}

  if (!isValidLanguage(language)) {
    res.status(400).json({ error: 'Invalid language' })
    return
  }
  if (typeof code !== 'string') {
    res.status(400).json({ error: 'code (string) is required' })
    return
  }

  try {
    await saveScript(GENERATED_TESTS_DIR, language, fileName, code)
    res.json({ fileName, language, code })
  } catch (error) {
    logger.error('Failed to save script', { error: String(error) })
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save script' })
  }
})
