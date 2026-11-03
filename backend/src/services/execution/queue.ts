import type { ExecutionEvent } from './liveReporter.js'
import type { ExecutionItem, ExecutionSession } from './types.js'
import type { ScriptLanguage } from '../scriptgen/types.js'

export interface RunHandle {
  stop: () => void
  exitCode: Promise<number | null>
}

export type ScriptRunner = (
  scriptRef: { language: ScriptLanguage; fileName: string },
  callbacks: { onEvent: (event: ExecutionEvent) => void; onLog: (line: string) => void },
) => RunHandle

export interface ExecutionQueueDeps {
  sessionId: string
  scripts: { language: ScriptLanguage; fileName: string }[]
  runScript: ScriptRunner
  onItemUpdate?: (index: number, item: ExecutionItem) => void
  onSessionUpdate?: (session: ExecutionSession) => void
}

const MAX_LOG_LINES = 500

// Runs a queue of scripts sequentially against the one physical device
// (running two at once isn't meaningful - there's only one phone), turning
// each script's live reporter events into ExecutionItem state. Depends only
// on an injected ScriptRunner so it's fully testable without spawning real
// processes - the real ADB/Mobilewright wiring lives in runner.ts.
export class ExecutionQueue {
  readonly session: ExecutionSession
  private stopped = false
  private currentHandle: RunHandle | null = null
  private readonly runPromise: Promise<void>

  constructor(private readonly deps: ExecutionQueueDeps) {
    this.session = {
      id: deps.sessionId,
      startedAt: new Date().toISOString(),
      status: 'running',
      currentIndex: 0,
      items: deps.scripts.map((script) => ({
        language: script.language,
        fileName: script.fileName,
        status: 'pending',
        steps: [],
        screenshots: [],
        logs: [],
      })),
    }
    this.runPromise = this.run()
  }

  private async run(): Promise<void> {
    for (let index = 0; index < this.session.items.length; index++) {
      if (this.stopped) {
        this.session.items[index].status = 'skipped'
        continue
      }
      this.session.currentIndex = index
      await this.runItem(index)
    }
    this.session.status = this.stopped ? 'stopped' : 'completed'
    this.session.finishedAt = new Date().toISOString()
    this.deps.onSessionUpdate?.(this.session)
  }

  private async runItem(index: number): Promise<void> {
    const item = this.session.items[index]
    item.status = 'running'
    item.startedAt = new Date().toISOString()
    this.notifyItem(index)

    await new Promise<void>((resolveItem) => {
      const handle = this.deps.runScript(
        { language: item.language, fileName: item.fileName },
        {
          onEvent: (event) => {
            this.applyEvent(item, event)
            this.notifyItem(index)
          },
          onLog: (line) => {
            item.logs.push(line)
            if (item.logs.length > MAX_LOG_LINES) item.logs.shift()
          },
        },
      )
      this.currentHandle = handle
      handle.exitCode.then(() => {
        this.currentHandle = null
        resolveItem()
      })
    })

    if (item.status === 'running') {
      // No test_end event ever arrived - the process was stopped, crashed,
      // or exited before Playwright's reporter could report a result.
      item.status = this.stopped ? 'stopped' : 'interrupted'
    }
    item.finishedAt = new Date().toISOString()
    if (item.startedAt) item.durationMs = Date.parse(item.finishedAt) - Date.parse(item.startedAt)
    this.notifyItem(index)
  }

  private applyEvent(item: ExecutionItem, event: ExecutionEvent): void {
    switch (event.event) {
      case 'step_begin':
        item.currentStepTitle = event.title
        break
      case 'step_end':
        item.steps.push({ title: event.title, status: event.status, durationMs: event.durationMs, error: event.error })
        break
      case 'test_end':
        item.status = event.status
        item.error = event.error
        item.screenshots = event.screenshots
        break
      case 'fatal_error':
        // Setup/worker-init failures never reach test_end - without setting
        // status here, runItem()'s fallback would report this as an opaque
        // "interrupted" with no visible cause once the process exits.
        item.status = 'failed'
        item.error = event.message
        item.logs.push(event.message)
        break
      default:
        break
    }
  }

  private notifyItem(index: number): void {
    this.deps.onItemUpdate?.(index, this.session.items[index])
  }

  stop(): void {
    this.stopped = true
    this.currentHandle?.stop()
  }

  whenDone(): Promise<ExecutionSession> {
    return this.runPromise.then(() => this.session)
  }
}
