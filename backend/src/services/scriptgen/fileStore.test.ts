import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { saveScript, readScript, listScripts } from './fileStore.js'

let baseDir: string

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), 'scriptgen-test-'))
})

afterEach(async () => {
  await rm(baseDir, { recursive: true, force: true })
})

describe('saveScript / readScript', () => {
  it('writes a script and reads it back', async () => {
    await saveScript(baseDir, 'typescript', 'login.test.ts', "test('x', () => {});")
    expect(await readScript(baseDir, 'typescript', 'login.test.ts')).toBe("test('x', () => {});")
  })

  it('separates typescript and javascript into their own directories', async () => {
    await saveScript(baseDir, 'typescript', 'a.test.ts', 'ts-content')
    await saveScript(baseDir, 'javascript', 'a.test.js', 'js-content')
    expect(await readScript(baseDir, 'typescript', 'a.test.ts')).toBe('ts-content')
    expect(await readScript(baseDir, 'javascript', 'a.test.js')).toBe('js-content')
  })

  it('returns null for a script that does not exist', async () => {
    expect(await readScript(baseDir, 'typescript', 'missing.test.ts')).toBeNull()
  })

  it('rejects a path-traversal file name instead of writing outside baseDir', async () => {
    await expect(saveScript(baseDir, 'typescript', '../../evil.test.ts', 'x')).rejects.toThrow()
  })

  it('rejects a file name that does not match the expected .test.ts/.test.js shape', async () => {
    await expect(saveScript(baseDir, 'typescript', 'not-a-script.txt', 'x')).rejects.toThrow()
  })

  it('returns null when reading a file name that fails validation, rather than throwing', async () => {
    expect(await readScript(baseDir, 'typescript', '../../etc/passwd')).toBeNull()
  })

  it('overwrites an existing script when saved again', async () => {
    await saveScript(baseDir, 'typescript', 'login.test.ts', 'version 1')
    await saveScript(baseDir, 'typescript', 'login.test.ts', 'version 2')
    expect(await readScript(baseDir, 'typescript', 'login.test.ts')).toBe('version 2')
  })
})

describe('listScripts', () => {
  it('returns an empty list when no scripts exist yet', async () => {
    expect(await listScripts(baseDir)).toEqual([])
  })

  it('lists scripts from both language directories', async () => {
    await saveScript(baseDir, 'typescript', 'a.test.ts', 'x')
    await saveScript(baseDir, 'javascript', 'b.test.js', 'y')
    const files = await listScripts(baseDir)
    expect(files.map((f) => f.fileName).sort()).toEqual(['a.test.ts', 'b.test.js'])
    expect(files.find((f) => f.fileName === 'a.test.ts')?.language).toBe('typescript')
    expect(files.find((f) => f.fileName === 'b.test.js')?.language).toBe('javascript')
  })

  it('ignores non-script files that might exist in the directory', async () => {
    await saveScript(baseDir, 'typescript', 'a.test.ts', 'x')
    const { writeFile, mkdir } = await import('node:fs/promises')
    await mkdir(join(baseDir, 'typescript'), { recursive: true })
    await writeFile(join(baseDir, 'typescript', 'README.md'), 'not a script')
    const files = await listScripts(baseDir)
    expect(files.map((f) => f.fileName)).toEqual(['a.test.ts'])
  })
})
