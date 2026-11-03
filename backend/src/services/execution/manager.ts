import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { broadcast } from '../../websocket/index.js'
import { ExecutionQueue } from './queue.js'
import { runScript } from './runner.js'
import type { ExecutionItem, ExecutionSession } from './types.js'
import type { ScriptLanguage } from '../scriptgen/types.js'

const GENERATED_TESTS_DIR = resolve(process.cwd(), env.generatedTestsDir)
const EXECUTIONS_DIR = resolve(process.cwd(), env.reportsDir, 'executions')
const SCREENSHOTS_DIR = resolve(process.cwd(), env.screenshotsDir)
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class ExecutionAlreadyActiveError extends Error {
  constructor() {
    super('A test execution is already in progress. Stop it before starting a new one.')
  }
}

export class NoActiveExecutionError extends Error {
  constructor() {
    super('No test execution is currently in progress.')
  }
}

class ExecutionManager {
  private active: ExecutionQueue | null = null
  private activeFinalized: Promise<void> = Promise.resolve()

  isRunning(): boolean {
    return this.active !== null
  }

  getActive(): ExecutionSession | null {
    return this.active?.session ?? null
  }

  async start(scripts: { language: ScriptLanguage; fileName: string }[]): Promise<ExecutionSession> {
    if (this.active) throw new ExecutionAlreadyActiveError()
    if (scripts.length === 0) throw new Error('No scripts selected to run')

    const sessionId = randomUUID()
    const queue = new ExecutionQueue({
      sessionId,
      scripts,
      runScript: (ref, callbacks) => {
        const scriptPath = join(
          GENERATED_TESTS_DIR,
          ref.language === 'typescript' ? 'typescript' : 'javascript',
          ref.fileName,
        )
        return runScript(scriptPath, callbacks)
      },
      onItemUpdate: (index, item) => broadcast('execution:item-update', { sessionId, index, item }),
      onSessionUpdate: (session) => broadcast('execution:finished', session),
    })

    this.active = queue
    broadcast('execution:started', queue.session)

    this.activeFinalized = queue.whenDone().then(async (session) => {
      try {
        await this.finalize(session)
      } finally {
        if (this.active === queue) this.active = null
      }
    })

    return queue.session
  }

  stop(): ExecutionSession {
    if (!this.active) throw new NoActiveExecutionError()
    this.active.stop()
    return this.active.session
  }

  // Unlike stop(), waits for the run to actually finish (process killed,
  // session finalized/persisted) - needed before it's safe to delete the
  // directories that finalize() writes into.
  async stopAndWait(): Promise<void> {
    if (!this.active) return
    this.active.stop()
    await this.activeFinalized
  }

  private async finalize(session: ExecutionSession): Promise<void> {
    for (let index = 0; index < session.items.length; index++) {
      await this.copyScreenshots(session.id, index, session.items[index])
    }
    await this.persist(session)
  }

  private async copyScreenshots(sessionId: string, index: number, item: ExecutionItem): Promise<void> {
    if (item.screenshots.length === 0) return
    const destDir = join(SCREENSHOTS_DIR, sessionId, String(index))
    await mkdir(destDir, { recursive: true })

    const publicPaths: string[] = []
    for (const sourcePath of item.screenshots) {
      try {
        const fileName = basename(sourcePath)
        await copyFile(sourcePath, join(destDir, fileName))
        publicPaths.push(`/screenshots/${sessionId}/${index}/${fileName}`)
      } catch (error) {
        logger.warn('Failed to copy execution screenshot', { sourcePath, error: String(error) })
      }
    }
    item.screenshots = publicPaths
  }

  private async persist(session: ExecutionSession): Promise<void> {
    await mkdir(EXECUTIONS_DIR, { recursive: true })
    await writeFile(join(EXECUTIONS_DIR, `${session.id}.json`), JSON.stringify(session, null, 2), 'utf-8')
  }

  async list(): Promise<ExecutionSession[]> {
    let files: string[]
    try {
      files = (await readdir(EXECUTIONS_DIR)).filter((file) => file.endsWith('.json'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }

    const sessions = await Promise.all(
      files.map(async (file) => {
        try {
          return JSON.parse(await readFile(join(EXECUTIONS_DIR, file), 'utf-8')) as ExecutionSession
        } catch (error) {
          logger.warn('Failed to read execution file', { file, error: String(error) })
          return null
        }
      }),
    )

    return sessions
      .filter((session): session is ExecutionSession => session !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  async get(id: string): Promise<ExecutionSession | null> {
    if (!SESSION_ID_PATTERN.test(id)) return null
    try {
      return JSON.parse(await readFile(join(EXECUTIONS_DIR, `${id}.json`), 'utf-8')) as ExecutionSession
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }
}

export const executionManager = new ExecutionManager()
