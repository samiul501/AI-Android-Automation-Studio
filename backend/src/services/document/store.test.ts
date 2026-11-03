import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSession, findTestCase, getSession, listSessions, saveOriginalFile, saveSession } from './store.js'
import type { TestScenario } from './types.js'

let uploadsDir: string

beforeEach(async () => {
  uploadsDir = await mkdtemp(join(tmpdir(), 'document-store-test-'))
})

afterEach(async () => {
  await rm(uploadsDir, { recursive: true, force: true })
})

describe('createSession', () => {
  it('builds a session with a preview truncated from the parsed text', () => {
    const session = createSession('spec.txt', {
      documentType: 'txt',
      text: 'a'.repeat(3000),
      truncated: false,
      fullTextLength: 3000,
    })
    expect(session.originalFileName).toBe('spec.txt')
    expect(session.status).toBe('uploaded')
    expect(session.textPreview.length).toBe(2000)
    expect(session.extractedText.length).toBe(3000)
    expect(session.scenarios).toEqual([])
  })
})

describe('saveSession / getSession / listSessions', () => {
  it('round-trips a session to disk and back', async () => {
    const session = createSession('spec.txt', {
      documentType: 'txt',
      text: 'hello',
      truncated: false,
      fullTextLength: 5,
    })
    await saveSession(uploadsDir, session)

    const fetched = await getSession(uploadsDir, session.id)
    expect(fetched).toEqual(session)
  })

  it('returns null for a session id that does not exist', async () => {
    expect(await getSession(uploadsDir, '11111111-1111-1111-1111-111111111111')).toBeNull()
  })

  it('returns null for a malformed id instead of touching the filesystem with it', async () => {
    expect(await getSession(uploadsDir, '../../evil')).toBeNull()
  })

  it('lists sessions newest first', async () => {
    const older = createSession('a.txt', { documentType: 'txt', text: 'a', truncated: false, fullTextLength: 1 })
    older.uploadedAt = '2024-01-01T00:00:00.000Z'
    const newer = createSession('b.txt', { documentType: 'txt', text: 'b', truncated: false, fullTextLength: 1 })
    newer.uploadedAt = '2024-06-01T00:00:00.000Z'

    await saveSession(uploadsDir, older)
    await saveSession(uploadsDir, newer)

    const sessions = await listSessions(uploadsDir)
    expect(sessions.map((s) => s.id)).toEqual([newer.id, older.id])
  })

  it('returns an empty list when no sessions have been saved yet', async () => {
    expect(await listSessions(uploadsDir)).toEqual([])
  })
})

describe('saveOriginalFile', () => {
  it('sanitizes an unsafe file name before writing to disk', async () => {
    await saveOriginalFile(uploadsDir, 'abc123', '../../evil.txt', Buffer.from('data'))
    const content = await readFile(join(uploadsDir, 'originals', 'abc123-.._.._evil.txt'), 'utf-8')
    expect(content).toBe('data')
  })
})

describe('findTestCase', () => {
  const scenarios: TestScenario[] = [
    {
      id: 's1',
      title: 'Login',
      description: '',
      testCases: [{ id: 'tc1', title: 'Valid login', description: '', priority: 'medium', steps: [], approved: false }],
    },
  ]

  it('finds a test case by id across scenarios', () => {
    const found = findTestCase(scenarios, 'tc1')
    expect(found?.scenario.id).toBe('s1')
    expect(found?.testCaseIndex).toBe(0)
  })

  it('returns null when the test case id is not present', () => {
    expect(findTestCase(scenarios, 'missing')).toBeNull()
  })
})
