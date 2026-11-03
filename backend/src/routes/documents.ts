import { Router } from 'express'
import multer from 'multer'
import { resolve } from 'node:path'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { AiNotConfiguredError, AiRefusedError } from '../services/ai/client.js'
import { analyzeDocument } from '../services/document/analyzer.js'
import { UnsupportedDocumentTypeError, parseDocument } from '../services/document/parsers.js'
import { renderTestCase } from '../services/document/scriptRenderer.js'
import {
  createSession,
  findTestCase,
  getSession,
  listSessions,
  saveOriginalFile,
  saveSession,
} from '../services/document/store.js'
import { saveScript } from '../services/scriptgen/fileStore.js'
import type { ScriptLanguage } from '../services/scriptgen/types.js'

const UPLOADS_DIR = resolve(process.cwd(), env.uploadsDir)
const GENERATED_TESTS_DIR = resolve(process.cwd(), env.generatedTestsDir)
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } })

export const documentsRouter = Router()

function isValidLanguage(value: unknown): value is ScriptLanguage {
  return value === 'typescript' || value === 'javascript'
}

documentsRouter.post('/documents/upload', upload.single('document'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No document was uploaded (expected multipart field "document")' })
    return
  }

  try {
    const parsed = await parseDocument(req.file.buffer, req.file.originalname)
    const session = createSession(req.file.originalname, parsed)
    await saveOriginalFile(UPLOADS_DIR, session.id, req.file.originalname, req.file.buffer)
    await saveSession(UPLOADS_DIR, session)
    res.status(201).json(session)
  } catch (error) {
    if (error instanceof UnsupportedDocumentTypeError) {
      res.status(400).json({ error: error.message })
      return
    }
    logger.error('Failed to parse uploaded document', { error: String(error) })
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to parse document' })
  }
})

documentsRouter.get('/documents', async (_req, res) => {
  res.json(await listSessions(UPLOADS_DIR))
})

documentsRouter.get('/documents/:id', async (req, res) => {
  const session = await getSession(UPLOADS_DIR, req.params.id)
  if (!session) {
    res.status(404).json({ error: 'Document session not found' })
    return
  }
  res.json(session)
})

// Requirement analysis is a real, potentially slow Claude call - kept as an
// explicit action the user triggers, never run automatically on upload, so
// the user can inspect the extracted text first if they want to.
documentsRouter.post('/documents/:id/analyze', async (req, res) => {
  const session = await getSession(UPLOADS_DIR, req.params.id)
  if (!session) {
    res.status(404).json({ error: 'Document session not found' })
    return
  }

  session.status = 'analyzing'
  await saveSession(UPLOADS_DIR, session)

  try {
    const scenarios = await analyzeDocument(session.originalFileName, session.documentType, session.extractedText)
    session.scenarios = scenarios
    session.status = 'reviewing'
    session.analyzedAt = new Date().toISOString()
    session.analysisError = undefined
    await saveSession(UPLOADS_DIR, session)
    res.json(session)
  } catch (error) {
    session.status = 'analysis-failed'
    session.analysisError = error instanceof Error ? error.message : 'Analysis failed'
    await saveSession(UPLOADS_DIR, session)

    if (error instanceof AiNotConfiguredError) {
      res.status(400).json({ error: error.message })
      return
    }
    if (error instanceof AiRefusedError) {
      res.status(502).json({ error: error.message })
      return
    }
    logger.error('Document analysis failed', { error: String(error) })
    res.status(500).json({ error: 'Failed to analyze document' })
  }
})

// The review step: the user edits/approves individual test cases before any
// script is generated. Replaces the full scenario list wholesale - simpler
// and safer than patching individual fields, since the client already has the
// full, current scenario tree from the GET/analyze response.
documentsRouter.put('/documents/:id/scenarios', async (req, res) => {
  const session = await getSession(UPLOADS_DIR, req.params.id)
  if (!session) {
    res.status(404).json({ error: 'Document session not found' })
    return
  }

  const { scenarios } = req.body ?? {}
  if (!Array.isArray(scenarios)) {
    res.status(400).json({ error: 'scenarios (array) is required' })
    return
  }

  session.scenarios = scenarios
  await saveSession(UPLOADS_DIR, session)
  res.json(session)
})

// Only ever called for a test case the user has explicitly approved in the
// review step - document-derived scripts are never generated or executed
// automatically, per the "no auto-execution of document-generated scripts" rule.
documentsRouter.post('/documents/:id/generate-script', async (req, res) => {
  const session = await getSession(UPLOADS_DIR, req.params.id)
  if (!session) {
    res.status(404).json({ error: 'Document session not found' })
    return
  }

  const { testCaseId, language } = req.body ?? {}
  if (typeof testCaseId !== 'string' || !isValidLanguage(language)) {
    res.status(400).json({ error: 'testCaseId (string) and language ("typescript" | "javascript") are required' })
    return
  }

  const found = findTestCase(session.scenarios, testCaseId)
  if (!found) {
    res.status(404).json({ error: 'Test case not found in this document session' })
    return
  }
  const testCase = found.scenario.testCases[found.testCaseIndex]
  if (!testCase.approved) {
    res.status(400).json({ error: 'This test case has not been approved for script generation yet' })
    return
  }

  const script = renderTestCase(testCase, language)
  await saveScript(GENERATED_TESTS_DIR, language, script.fileName, script.code)

  session.generatedScripts = session.generatedScripts.filter((entry) => entry.testCaseId !== testCaseId)
  session.generatedScripts.push({
    testCaseId,
    language,
    fileName: script.fileName,
    generatedAt: new Date().toISOString(),
  })
  await saveSession(UPLOADS_DIR, session)

  res.status(201).json(script)
})
