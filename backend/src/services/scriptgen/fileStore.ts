import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ScriptLanguage } from './types.js'

// Deliberately strict: filenames here are used to build filesystem paths, and
// may originate from a route param, so only a narrow, safe shape is allowed.
const SAFE_FILE_NAME_PATTERN = /^[a-zA-Z0-9._-]+\.test\.(ts|js)$/

export interface ScriptFileSummary {
  fileName: string
  language: ScriptLanguage
  sizeBytes: number
  modifiedAt: string
}

function languageDir(baseDir: string, language: ScriptLanguage): string {
  return join(baseDir, language === 'typescript' ? 'typescript' : 'javascript')
}

function isSafeFileName(fileName: string): boolean {
  return SAFE_FILE_NAME_PATTERN.test(fileName)
}

export async function saveScript(
  baseDir: string,
  language: ScriptLanguage,
  fileName: string,
  code: string,
): Promise<string> {
  if (!isSafeFileName(fileName)) throw new Error(`Invalid script file name: ${fileName}`)
  const dir = languageDir(baseDir, language)
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, fileName)
  await writeFile(filePath, code, 'utf-8')
  return filePath
}

export async function readScript(baseDir: string, language: ScriptLanguage, fileName: string): Promise<string | null> {
  if (!isSafeFileName(fileName)) return null
  try {
    return await readFile(join(languageDir(baseDir, language), fileName), 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function listScripts(baseDir: string): Promise<ScriptFileSummary[]> {
  const languages: ScriptLanguage[] = ['typescript', 'javascript']
  const results: ScriptFileSummary[] = []

  for (const language of languages) {
    const dir = languageDir(baseDir, language)
    let fileNames: string[]
    try {
      fileNames = (await readdir(dir)).filter(isSafeFileName)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }

    for (const fileName of fileNames) {
      const info = await stat(join(dir, fileName))
      results.push({ fileName, language, sizeBytes: info.size, modifiedAt: info.mtime.toISOString() })
    }
  }

  return results.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}
