import { mkdir, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'
import { recordingManager } from './recording/manager.js'
import { executionManager } from './execution/manager.js'

const RECORDINGS_DIR = resolve(process.cwd(), env.recordingsDir)
const GENERATED_TESTS_DIR = resolve(process.cwd(), env.generatedTestsDir)
const REPORTS_DIR = resolve(process.cwd(), env.reportsDir)
const SCREENSHOTS_DIR = resolve(process.cwd(), env.screenshotsDir)

async function clearDirContents(dir: string): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  await Promise.all(entries.map((entry) => rm(join(dir, entry), { recursive: true, force: true })))
}

// Stops any in-flight recording/execution, then permanently deletes every
// saved recording, generated script, and execution report/screenshot so the
// app comes back with a clean slate for a new session. Irreversible - the
// route calling this is responsible for getting explicit user confirmation
// first; this function performs the wipe unconditionally.
export async function resetSystem(): Promise<void> {
  if (recordingManager.isRecording()) {
    try {
      await recordingManager.stop()
    } catch (error) {
      logger.warn('Failed to stop active recording during system reset', { error: String(error) })
    }
  }
  if (executionManager.isRunning()) {
    try {
      await executionManager.stopAndWait()
    } catch (error) {
      logger.warn('Failed to stop active execution during system reset', { error: String(error) })
    }
  }

  await Promise.all([
    clearDirContents(RECORDINGS_DIR),
    clearDirContents(GENERATED_TESTS_DIR),
    clearDirContents(REPORTS_DIR),
    clearDirContents(SCREENSHOTS_DIR),
  ])
  await Promise.all([
    mkdir(RECORDINGS_DIR, { recursive: true }),
    mkdir(GENERATED_TESTS_DIR, { recursive: true }),
    mkdir(REPORTS_DIR, { recursive: true }),
    mkdir(SCREENSHOTS_DIR, { recursive: true }),
  ])
}
