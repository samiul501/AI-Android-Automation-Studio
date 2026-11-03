import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocumentSession, TestScenario } from './types.js'

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TEXT_PREVIEW_LENGTH = 2000

function sessionsDir(uploadsDir: string): string {
  return join(uploadsDir, 'sessions')
}

async function persist(uploadsDir: string, session: DocumentSession): Promise<void> {
  const dir = sessionsDir(uploadsDir)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${session.id}.json`), JSON.stringify(session, null, 2), 'utf-8')
}

export function createSession(
  originalFileName: string,
  parsed: { documentType: DocumentSession['documentType']; text: string; truncated: boolean; fullTextLength: number },
): DocumentSession {
  return {
    id: randomUUID(),
    originalFileName,
    documentType: parsed.documentType,
    uploadedAt: new Date().toISOString(),
    extractedText: parsed.text,
    textPreview: parsed.text.slice(0, TEXT_PREVIEW_LENGTH),
    fullTextLength: parsed.fullTextLength,
    truncated: parsed.truncated,
    status: 'uploaded',
    scenarios: [],
    generatedScripts: [],
  }
}

export async function saveSession(uploadsDir: string, session: DocumentSession): Promise<void> {
  await persist(uploadsDir, session)
}

export async function listSessions(uploadsDir: string): Promise<DocumentSession[]> {
  let files: string[]
  try {
    files = (await readdir(sessionsDir(uploadsDir))).filter((file) => file.endsWith('.json'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const sessions = await Promise.all(
    files.map(async (file) => {
      try {
        return JSON.parse(await readFile(join(sessionsDir(uploadsDir), file), 'utf-8')) as DocumentSession
      } catch {
        return null
      }
    }),
  )

  return sessions
    .filter((session): session is DocumentSession => session !== null)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
}

export async function getSession(uploadsDir: string, id: string): Promise<DocumentSession | null> {
  if (!SESSION_ID_PATTERN.test(id)) return null
  try {
    return JSON.parse(await readFile(join(sessionsDir(uploadsDir), `${id}.json`), 'utf-8')) as DocumentSession
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function originalsDir(uploadsDir: string): string {
  return join(uploadsDir, 'originals')
}

// The original bytes are kept alongside the parsed session so a user can
// re-run analysis later without re-uploading, and so nothing about the source
// document is lost once it's been distilled into extracted text. `fileName`
// comes from the client's multipart upload, so it's stripped down to a safe
// basename before ever touching a filesystem path (no path traversal).
export async function saveOriginalFile(
  uploadsDir: string,
  sessionId: string,
  fileName: string,
  buffer: Buffer,
): Promise<void> {
  const safeName = fileName.replace(/[/\\]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_') || 'upload'
  const dir = originalsDir(uploadsDir)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${sessionId}-${safeName}`), buffer)
}

export function findTestCase(
  scenarios: TestScenario[],
  testCaseId: string,
): { scenario: TestScenario; testCaseIndex: number } | null {
  for (const scenario of scenarios) {
    const testCaseIndex = scenario.testCases.findIndex((testCase) => testCase.id === testCaseId)
    if (testCaseIndex !== -1) return { scenario, testCaseIndex }
  }
  return null
}
