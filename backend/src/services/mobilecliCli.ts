import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Unlike `mobilewright`, the `mobilecli` package has no "exports" restriction,
// so its own JS shim (which itself picks the right platform binary) is
// directly resolvable and safe to spawn through node.
function resolveCliEntryPoint(): string {
  return require.resolve('mobilecli')
}

export interface CliResult {
  stdout: string
  stderr: string
  exitCode: number
}

export function runMobilecli(args: string[], timeoutMs = 15_000): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [resolveCliEntryPoint(), ...args],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && typeof error.code === 'string') {
          reject(error)
          return
        }
        const exitCode = error && typeof error.code === 'number' ? error.code : 0
        resolve({ stdout, stderr, exitCode })
      },
    )
  })
}
