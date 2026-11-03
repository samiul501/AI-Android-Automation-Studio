import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { broadcast } from '../../websocket/index.js'
import { RecordingSession } from './session.js'
import {
  createLiveTouchEventSource,
  elementsToRawTree,
  getForegroundApp,
  getInspectorElements,
  getUiSnapshot,
  relaunchApp,
  resolveTouchInput,
} from './liveCapture.js'
import { extractPackageName } from '../scriptgen/generator.js'
import type { RecordingSession as RecordingSessionData } from './types.js'

const RECORDINGS_DIR = resolve(process.cwd(), env.recordingsDir)
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class RecordingAlreadyActiveError extends Error {
  constructor() {
    super('A recording session is already in progress. Stop it before starting a new one.')
  }
}

export class NoActiveRecordingError extends Error {
  constructor() {
    super('No recording session is currently in progress.')
  }
}

class RecordingManager {
  private active: RecordingSession | null = null

  isRecording(): boolean {
    return this.active !== null
  }

  getActive(): RecordingSessionData | null {
    return this.active?.data ?? null
  }

  async start(serial: string): Promise<RecordingSessionData> {
    if (this.active) throw new RecordingAlreadyActiveError()

    // The Execution Engine always force-relaunches the target app before
    // running a generated script (terminate then launch - see
    // @mobilewright/test's device fixture). If recording started from
    // whatever screen the app happened to be on, replay's fresh launch would
    // land on a different screen and every recorded locator would miss. Doing
    // the same terminate+launch here, before any gesture is captured, makes
    // the recorded flow start from the exact state replay will reproduce.
    const bundleId = extractPackageName(await getForegroundApp(serial))
    if (bundleId) {
      try {
        await relaunchApp(serial, bundleId)
        // No reliable cross-app "fully rendered" signal is available (activity
        // transitions and cold-start work vary too much) - a short fixed
        // settle window is the same pragmatic tradeoff the Execution Engine's
        // own launch step relies on.
        await new Promise((r) => setTimeout(r, 1500))
      } catch (error) {
        logger.warn('Failed to relaunch app before recording; continuing from current screen', {
          serial,
          bundleId,
          error: String(error),
        })
      }
    } else {
      logger.warn('Could not detect a foreground app package; recording from the current screen as-is', { serial })
    }

    const { scaler, devicePath } = await resolveTouchInput(serial)
    if (!devicePath) {
      logger.warn(
        'Could not identify the touchscreen input device; capturing every input device at once, which can misclassify taps as swipes if the phone has other ABS_X/ABS_Y-reporting devices (e.g. a stylus digitizer)',
        { serial },
      )
    }
    const eventSource = createLiveTouchEventSource(serial, devicePath)

    const session: RecordingSession = new RecordingSession({
      deviceSerial: serial,
      eventSource,
      scaler,
      // The Inspector's element/locator derivation is far more reliable than
      // this app's own uiTree.ts hit-testing (see locator/inspectorLocator.ts),
      // so it's the primary source for every gesture's snapshot - falling
      // back to the plain `mobilecli dump ui` snapshot only if the Inspector
      // itself is unreachable, so a transient Inspector hiccup doesn't blank
      // out element/locator info for the whole gesture.
      getSnapshot: async () => {
        const elements = await getInspectorElements(serial)
        if (elements) return elementsToRawTree(elements)
        return getUiSnapshot(serial)
      },
      getForegroundApp: () => getForegroundApp(serial),
      onAction: (action) => broadcast('recording:action', { sessionId: session.data.id, action }),
      onError: (error) => logger.error('Recording session error', { serial, error: String(error) }),
    })

    this.active = session
    broadcast('recording:started', session.data)
    return session.data
  }

  async stop(): Promise<RecordingSessionData> {
    if (!this.active) throw new NoActiveRecordingError()
    const session = this.active
    this.active = null

    const finalData = await session.stop()
    await this.persist(finalData)
    broadcast('recording:stopped', finalData)
    return finalData
  }

  private async persist(data: RecordingSessionData): Promise<void> {
    await mkdir(RECORDINGS_DIR, { recursive: true })
    await writeFile(join(RECORDINGS_DIR, `${data.id}.json`), JSON.stringify(data, null, 2), 'utf-8')
  }

  async list(): Promise<RecordingSessionData[]> {
    let files: string[]
    try {
      files = (await readdir(RECORDINGS_DIR)).filter((file) => file.endsWith('.json'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }

    const sessions = await Promise.all(
      files.map(async (file) => {
        try {
          return JSON.parse(await readFile(join(RECORDINGS_DIR, file), 'utf-8')) as RecordingSessionData
        } catch (error) {
          logger.warn('Failed to read recording file', { file, error: String(error) })
          return null
        }
      }),
    )

    return sessions
      .filter((session): session is RecordingSessionData => session !== null)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  async get(id: string): Promise<RecordingSessionData | null> {
    // IDs come straight from a route param; reject anything that isn't a
    // UUID before it's used to build a filesystem path.
    if (!SESSION_ID_PATTERN.test(id)) return null

    try {
      return JSON.parse(await readFile(join(RECORDINGS_DIR, `${id}.json`), 'utf-8')) as RecordingSessionData
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }
}

export const recordingManager = new RecordingManager()
