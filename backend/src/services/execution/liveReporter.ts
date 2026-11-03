import type { Reporter, TestCase, TestResult, TestStep, FullResult, TestError } from '@playwright/test/reporter'

// Emitted as single-line JSON on stdout, prefixed with a unique marker, so the
// backend (which spawns `mobilewright test` as a child process) can pick
// these out from ordinary console output written by the app-under-test or
// other reporters running alongside this one.
//
// Deliberately standalone: Playwright loads this file directly from source
// via its own transform pipeline (the same mechanism it uses for
// mobilewright.config.ts), independent of the backend's own tsc build, so it
// avoids importing anything from the rest of the backend.
export const EXECUTION_EVENT_MARKER = '@@MWSTUDIO_EVENT@@'

export type ExecutionEvent =
  | { event: 'test_begin'; title: string }
  | { event: 'step_begin'; title: string }
  | { event: 'step_end'; title: string; durationMs: number; status: 'passed' | 'failed'; error?: string }
  | {
      event: 'test_end'
      status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'
      durationMs: number
      error?: string
      screenshots: string[]
    }
  | { event: 'run_end'; status: 'passed' | 'failed' | 'timedout' | 'interrupted' }
  | { event: 'fatal_error'; message: string }

function emit(payload: ExecutionEvent): void {
  console.log(EXECUTION_EVENT_MARKER + JSON.stringify(payload))
}

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g

function stripAnsi(message: string | undefined): string | undefined {
  return message?.replace(ANSI_PATTERN, '')
}

export default class LiveReporter implements Reporter {
  onTestBegin(test: TestCase): void {
    emit({ event: 'test_begin', title: test.title })
  }

  onStepBegin(_test: TestCase, _result: TestResult, step: TestStep): void {
    if (step.category !== 'test.step') return
    emit({ event: 'step_begin', title: step.title })
  }

  onStepEnd(_test: TestCase, _result: TestResult, step: TestStep): void {
    if (step.category !== 'test.step') return
    emit({
      event: 'step_end',
      title: step.title,
      durationMs: step.duration,
      status: step.error ? 'failed' : 'passed',
      error: stripAnsi(step.error?.message),
    })
  }

  onTestEnd(_test: TestCase, result: TestResult): void {
    const screenshots = result.attachments
      .filter((attachment) => attachment.contentType.startsWith('image/') && attachment.path)
      .map((attachment) => attachment.path as string)

    emit({
      event: 'test_end',
      status: result.status,
      durationMs: result.duration,
      error: stripAnsi(result.error?.message),
      screenshots,
    })
  }

  onEnd(result: FullResult): void {
    emit({ event: 'run_end', status: result.status })
  }

  // Fatal errors that happen outside any test (global setup, worker
  // initialization - e.g. the mobilecli/device driver failing to connect)
  // reach reporters only through onError, never onTestEnd. Without this,
  // such a failure produces no test_begin/test_end and no console output at
  // all: the child process just exits, and the queue can only report
  // "interrupted" with an empty log, hiding the actual cause.
  onError(error: TestError): void {
    emit({ event: 'fatal_error', message: stripAnsi(error.message) ?? String(error.value ?? 'Unknown fatal error') })
  }
}
