import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backupScript } from './versions.js'
import { saveScript, readScript } from './fileStore.js'

let baseDir: string

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'versions-test-'))
})

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true })
})

describe('backupScript', () => {
  it('copies the current script content into a .versions backup file', async () => {
    await saveScript(baseDir, 'typescript', 'login.test.ts', 'original content')
    const backupFileName = await backupScript(baseDir, 'typescript', 'login.test.ts')

    expect(backupFileName).toMatch(/^login\.test\.ts\..*\.bak$/)
    const backupContent = await readFile(join(baseDir, 'typescript', '.versions', backupFileName as string), 'utf-8')
    expect(backupContent).toBe('original content')
  })

  it('does not modify the original script', async () => {
    await saveScript(baseDir, 'typescript', 'login.test.ts', 'original content')
    await backupScript(baseDir, 'typescript', 'login.test.ts')
    expect(await readScript(baseDir, 'typescript', 'login.test.ts')).toBe('original content')
  })

  it('returns null when the script does not exist yet (nothing to back up)', async () => {
    expect(await backupScript(baseDir, 'typescript', 'missing.test.ts')).toBeNull()
  })

  it('rejects an unsafe file name', async () => {
    await expect(backupScript(baseDir, 'typescript', '../../evil.test.ts')).rejects.toThrow()
  })

  it('creates a distinct backup file on each call', async () => {
    await saveScript(baseDir, 'typescript', 'login.test.ts', 'v1')
    const first = await backupScript(baseDir, 'typescript', 'login.test.ts')
    await saveScript(baseDir, 'typescript', 'login.test.ts', 'v2')
    const second = await backupScript(baseDir, 'typescript', 'login.test.ts')
    expect(first).not.toBe(second)
  })
})
