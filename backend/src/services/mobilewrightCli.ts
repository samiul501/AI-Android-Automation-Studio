import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

// mobilewright's package.json only exports the "." subpath, so dist/cli.js isn't
// importable directly — resolve the public entry point and locate its sibling.
export function resolveMobilewrightCliPath(): string {
  const indexPath = require.resolve('mobilewright')
  return join(dirname(indexPath), 'cli.js')
}

export interface CliResult {
  stdout: string
  stderr: string
  exitCode: number
}

// `mobilewright doctor` (and potentially other subcommands) exit non-zero on
// findings, not on invocation failure, so a non-zero exit is a normal result
// here, not a rejection. Only a spawn-level failure (e.g. missing cli.js) rejects.
export function runMobilewrightCli(args: string[], timeoutMs = 30_000): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [resolveMobilewrightCliPath(), ...args],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
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
