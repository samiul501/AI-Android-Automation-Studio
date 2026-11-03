import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { relative, resolve } from 'node:path'
import { resolveMobilewrightCliPath } from '../mobilewrightCli.js'
import { EXECUTION_EVENT_MARKER, type ExecutionEvent } from './liveReporter.js'
import { logger } from '../../config/logger.js'

// Playwright loads a custom reporter directly from source via its own
// transform pipeline (the same mechanism used for mobilewright.config.ts),
// so this points at liveReporter.ts itself, not a compiled dist copy -
// process.cwd() is always backend/ here, whether running via `tsx watch` in
// dev or `node dist/index.js` in production.
const LIVE_REPORTER_PATH = resolve(process.cwd(), 'src/services/execution/liveReporter.ts')

// mobilewright.config.ts lives at the repo root, and the CLI looks for it
// relative to its own cwd.
const REPO_ROOT = resolve(process.cwd(), '..')

export interface RunnerCallbacks {
  onEvent: (event: ExecutionEvent) => void
  onLog: (line: string) => void
}

export interface RunHandle {
  stop: () => void
  exitCode: Promise<number | null>
}

// Spawns `mobilewright test <scriptPath> --reporter <liveReporter>` and
// streams parsed events + raw log lines to the caller as they arrive.
export function runScript(scriptPath: string, callbacks: RunnerCallbacks): RunHandle {
  // mobilewright/Playwright treats the CLI's file argument as a *regex*
  // matched against each discovered test file's path relative to the project
  // root - an absolute path never matches anything ("No tests found"), and
  // on Windows, path.relative()'s backslashes are themselves regex escape
  // sequences (e.g. a literal "\t" becomes a tab), which silently breaks the
  // match too. Forward slashes work as a literal path segment on every OS.
  const testFilter = relative(REPO_ROOT, scriptPath).split(/[\\/]/).join('/')

  const child = spawn(
    process.execPath,
    [resolveMobilewrightCliPath(), 'test', testFilter, '--reporter', LIVE_REPORTER_PATH],
    { windowsHide: true, cwd: REPO_ROOT },
  )

  const handleLine = (line: string): void => {
    if (!line.startsWith(EXECUTION_EVENT_MARKER)) {
      callbacks.onLog(line)
      return
    }
    try {
      callbacks.onEvent(JSON.parse(line.slice(EXECUTION_EVENT_MARKER.length)) as ExecutionEvent)
    } catch (error) {
      logger.warn('Failed to parse execution event line', { line, error: String(error) })
    }
  }

  createInterface({ input: child.stdout }).on('line', handleLine)
  createInterface({ input: child.stderr }).on('line', (line) => callbacks.onLog(line))
  child.on('error', (error) => callbacks.onLog(`[spawn error] ${error.message}`))

  const exitCode = new Promise<number | null>((res) => {
    child.on('close', (code) => res(code))
  })

  return { stop: () => child.kill(), exitCode }
}
