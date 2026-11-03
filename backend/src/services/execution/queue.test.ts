import { describe, it, expect, vi } from 'vitest'
import { ExecutionQueue, type ScriptRunner, type RunHandle } from './queue.js'
import type { ExecutionEvent } from './liveReporter.js'

interface FakeRun {
  emit: (event: ExecutionEvent) => void
  log: (line: string) => void
  finish: (exitCode?: number | null) => void
  stopped: boolean
}

// Builds a fake ScriptRunner that hands back one FakeRun per invocation (in
// call order), so a test can script exactly what each queued item does and
// when it "finishes" (mirroring how a real child process exits).
function fakeRunner(): { runScript: ScriptRunner; runs: FakeRun[] } {
  const runs: FakeRun[] = []
  const runScript: ScriptRunner = (_ref, callbacks) => {
    let resolveExit: (code: number | null) => void = () => {}
    const exitCode = new Promise<number | null>((res) => {
      resolveExit = res
    })
    const run: FakeRun = {
      emit: (event) => callbacks.onEvent(event),
      log: (line) => callbacks.onLog(line),
      finish: (code = 0) => resolveExit(code),
      stopped: false,
    }
    runs.push(run)
    const handle: RunHandle = {
      stop: () => {
        run.stopped = true
        resolveExit(null)
      },
      exitCode,
    }
    return handle
  }
  return { runScript, runs }
}

describe('ExecutionQueue', () => {
  it('starts the session with the given id and immediately begins the first item', () => {
    const { runScript } = fakeRunner()
    const queue = new ExecutionQueue({
      sessionId: 'session-1',
      scripts: [{ language: 'typescript', fileName: 'a.test.ts' }],
      runScript,
    })
    expect(queue.session.id).toBe('session-1')
    expect(queue.session.status).toBe('running')
    // The first item starts synchronously on construction (not deferred),
    // so it's already "running" by the time the constructor returns.
    expect(queue.session.items[0].status).toBe('running')
  })

  it('leaves later queue items pending until their turn', () => {
    const { runScript, runs } = fakeRunner()
    const queue = new ExecutionQueue({
      sessionId: 's1',
      scripts: [
        { language: 'typescript', fileName: 'a.test.ts' },
        { language: 'typescript', fileName: 'b.test.ts' },
      ],
      runScript,
    })
    expect(queue.session.items[1].status).toBe('pending')
    expect(runs).toHaveLength(1) // the second script hasn't been started yet

    // Clean up so this test doesn't leave a dangling unresolved run behind.
    queue.stop()
  })

  it('marks an item running, applies step and test_end events, then finishes it', async () => {
    const { runScript, runs } = fakeRunner()
    const queue = new ExecutionQueue({
      sessionId: 's1',
      scripts: [{ language: 'typescript', fileName: 'a.test.ts' }],
      runScript,
    })

    await vi.waitFor(() => expect(runs).toHaveLength(1))
    expect(queue.session.items[0].status).toBe('running')

    runs[0].emit({ event: 'step_begin', title: 'Tap Login' })
    expect(queue.session.items[0].currentStepTitle).toBe('Tap Login')

    runs[0].emit({ event: 'step_end', title: 'Tap Login', durationMs: 120, status: 'passed' })
    expect(queue.session.items[0].steps).toEqual([{ title: 'Tap Login', durationMs: 120, status: 'passed' }])

    runs[0].emit({ event: 'test_end', status: 'passed', durationMs: 500, screenshots: [] })
    runs[0].finish(0)

    const finished = await queue.whenDone()
    expect(finished.status).toBe('completed')
    expect(finished.items[0].status).toBe('passed')
    expect(finished.items[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('runs multiple scripts sequentially, one at a time', async () => {
    const { runScript, runs } = fakeRunner()
    const queue = new ExecutionQueue({
      sessionId: 's1',
      scripts: [
        { language: 'typescript', fileName: 'a.test.ts' },
        { language: 'typescript', fileName: 'b.test.ts' },
      ],
      runScript,
    })

    await vi.waitFor(() => expect(runs).toHaveLength(1))
    expect(queue.session.items[1].status).toBe('pending')

    runs[0].emit({ event: 'test_end', status: 'passed', durationMs: 100, screenshots: [] })
    runs[0].finish(0)

    await vi.waitFor(() => expect(runs).toHaveLength(2))
    expect(queue.session.items[0].status).toBe('passed')
    expect(queue.session.items[1].status).toBe('running')

    runs[1].emit({ event: 'test_end', status: 'failed', durationMs: 50, error: 'boom', screenshots: [] })
    runs[1].finish(1)

    const finished = await queue.whenDone()
    expect(finished.items.map((i) => i.status)).toEqual(['passed', 'failed'])
  })

  it('stops the running item and skips the rest of the queue', async () => {
    const { runScript, runs } = fakeRunner()
    const queue = new ExecutionQueue({
      sessionId: 's1',
      scripts: [
        { language: 'typescript', fileName: 'a.test.ts' },
        { language: 'typescript', fileName: 'b.test.ts' },
      ],
      runScript,
    })

    await vi.waitFor(() => expect(runs).toHaveLength(1))
    queue.stop()
    expect(runs[0].stopped).toBe(true)

    const finished = await queue.whenDone()
    expect(finished.status).toBe('stopped')
    expect(finished.items[0].status).toBe('stopped')
    expect(finished.items[1].status).toBe('skipped')
    expect(runs).toHaveLength(1) // the second script was never even started
  })

  it('marks an item "interrupted" if the process exits with no test_end event and no stop was requested', async () => {
    const { runScript, runs } = fakeRunner()
    const queue = new ExecutionQueue({
      sessionId: 's1',
      scripts: [{ language: 'typescript', fileName: 'a.test.ts' }],
      runScript,
    })

    await vi.waitFor(() => expect(runs).toHaveLength(1))
    runs[0].finish(1) // crashed / exited without ever reporting test_end

    const finished = await queue.whenDone()
    expect(finished.items[0].status).toBe('interrupted')
  })

  it('caps stored log lines to avoid unbounded memory growth on a noisy script', async () => {
    const { runScript, runs } = fakeRunner()
    const queue = new ExecutionQueue({
      sessionId: 's1',
      scripts: [{ language: 'typescript', fileName: 'a.test.ts' }],
      runScript,
    })

    await vi.waitFor(() => expect(runs).toHaveLength(1))
    for (let i = 0; i < 600; i++) runs[0].log(`line ${i}`)
    expect(queue.session.items[0].logs).toHaveLength(500)
    expect(queue.session.items[0].logs[0]).toBe('line 100')

    runs[0].emit({ event: 'test_end', status: 'passed', durationMs: 10, screenshots: [] })
    runs[0].finish(0)
    await queue.whenDone()
  })

  it('notifies onItemUpdate and onSessionUpdate as the run progresses', async () => {
    const { runScript, runs } = fakeRunner()
    const onItemUpdate = vi.fn()
    const onSessionUpdate = vi.fn()
    const queue = new ExecutionQueue({
      sessionId: 's1',
      scripts: [{ language: 'typescript', fileName: 'a.test.ts' }],
      runScript,
      onItemUpdate,
      onSessionUpdate,
    })

    await vi.waitFor(() => expect(runs).toHaveLength(1))
    runs[0].emit({ event: 'test_end', status: 'passed', durationMs: 10, screenshots: [] })
    runs[0].finish(0)
    await queue.whenDone()

    expect(onItemUpdate).toHaveBeenCalled()
    expect(onSessionUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }))
  })
})
