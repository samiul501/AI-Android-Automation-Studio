import { ZipArchive } from 'archiver'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import type { ExecutionSession } from '../execution/types.js'
import { buildHtmlReport } from './htmlReport.js'

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// Bundles the report in every format alongside any failure screenshots, so a
// user can hand the whole thing to someone else without separate downloads.
export async function buildZipReport(session: ExecutionSession, screenshotsDir: string): Promise<Buffer> {
  const archive = new ZipArchive({ zlib: { level: 9 } })
  const chunks: Buffer[] = []

  const done = new Promise<Buffer>((resolve, reject) => {
    archive.on('data', (chunk) => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
  })

  archive.append(buildHtmlReport(session), { name: 'report.html' })
  archive.append(JSON.stringify(session, null, 2), { name: 'report.json' })

  const sessionScreenshotsDir = join(screenshotsDir, session.id)
  if (await pathExists(sessionScreenshotsDir)) {
    archive.directory(sessionScreenshotsDir, 'screenshots')
  }

  await archive.finalize()
  return done
}
