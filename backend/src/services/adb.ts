import { execFile } from 'node:child_process'
import { env } from '../config/env.js'

export interface AdbResult {
  stdout: string
  stderr: string
}

export class AdbNotFoundError extends Error {
  constructor() {
    super('ADB / Android SDK Platform-Tools is required.')
    this.name = 'AdbNotFoundError'
  }
}

// Runs an adb command via execFile (never a shell) so arguments can never be
// interpreted as shell syntax, even though our current call sites use fixed args.
export function runAdb(args: string[], timeoutMs = 10_000): Promise<AdbResult> {
  return new Promise((resolve, reject) => {
    execFile(env.adbPath, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          reject(new AdbNotFoundError())
          return
        }
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

// Some adb subcommands (e.g. `disconnect`) report their outcome via a
// non-zero exit code plus a stdout/stderr message rather than an invocation
// failure - runAdb's reject-on-any-error behavior would discard that message.
// This variant always resolves with whatever adb printed, only rejecting on
// a genuine spawn failure (missing binary).
export function runAdbAllowNonZeroExit(args: string[], timeoutMs = 10_000): Promise<AdbResult> {
  return new Promise((resolve, reject) => {
    execFile(env.adbPath, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new AdbNotFoundError())
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

export async function isAdbAvailable(): Promise<boolean> {
  try {
    await runAdb(['version'])
    return true
  } catch (error) {
    if (error instanceof AdbNotFoundError) return false
    throw error
  }
}
