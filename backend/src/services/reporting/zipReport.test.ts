import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildZipReport } from './zipReport.js'
import type { ExecutionSession } from '../execution/types.js'

let screenshotsDir: string

beforeEach(async () => {
  screenshotsDir = await mkdtemp(join(tmpdir(), 'zip-report-test-'))
})

afterEach(async () => {
  await rm(screenshotsDir, { recursive: true, force: true })
})

function makeSession(): ExecutionSession {
  return {
    id: 's1',
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'completed',
    currentIndex: 0,
    items: [
      { language: 'typescript', fileName: 'login.test.ts', status: 'passed', steps: [], screenshots: [], logs: [] },
    ],
  }
}

describe('buildZipReport', () => {
  it('produces a real, non-empty zip buffer with a valid zip header', async () => {
    const buffer = await buildZipReport(makeSession(), screenshotsDir)
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 2).toString('ascii')).toBe('PK')
  })

  it('bundles screenshots when they exist on disk for this session', async () => {
    const sessionScreenshotsDir = join(screenshotsDir, 's1', '0')
    await mkdir(sessionScreenshotsDir, { recursive: true })
    await writeFile(join(sessionScreenshotsDir, 'failure.png'), Buffer.from([0, 1, 2, 3]))

    const buffer = await buildZipReport(makeSession(), screenshotsDir)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('does not fail when no screenshots directory exists for this session', async () => {
    await expect(buildZipReport(makeSession(), screenshotsDir)).resolves.toBeInstanceOf(Buffer)
  })
})
