import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ScriptLanguage } from './types.js'

const SAFE_FILE_NAME_PATTERN = /^[a-zA-Z0-9._-]+\.test\.(ts|js)$/

function languageDir(baseDir: string, language: ScriptLanguage): string {
  return join(baseDir, language === 'typescript' ? 'typescript' : 'javascript')
}

// Backs up the CURRENT on-disk content of a script before an AI-suggested fix
// overwrites it, so nothing a human recorded is ever silently lost - per the
// "never overwrite the original script automatically" rule, this only ever
// runs as part of an explicit user-triggered "Apply AI Fix" action.
export async function backupScript(
  baseDir: string,
  language: ScriptLanguage,
  fileName: string,
): Promise<string | null> {
  if (!SAFE_FILE_NAME_PATTERN.test(fileName)) throw new Error(`Invalid script file name: ${fileName}`)

  const sourcePath = join(languageDir(baseDir, language), fileName)

  let content: string
  try {
    content = await readFile(sourcePath, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }

  const versionsDir = join(languageDir(baseDir, language), '.versions')
  await mkdir(versionsDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFileName = `${fileName}.${timestamp}.bak`
  await writeFile(join(versionsDir, backupFileName), content, 'utf-8')
  return backupFileName
}
