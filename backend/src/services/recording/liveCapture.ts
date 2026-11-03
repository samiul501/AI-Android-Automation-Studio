import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { runAdb } from '../adb.js'
import { runMobilecli } from '../mobilecliCli.js'
import { inspectorFetch, ensureInspectorDeviceSelected } from '../inspector.js'
import { logger } from '../../config/logger.js'
import { parseGeteventLine } from './touchEventParser.js'
import { GestureDetector, type RawGesture } from './gestureDetector.js'
import {
  parseTouchGeometry,
  createCoordinateScaler,
  IDENTITY_SCALER,
  type CoordinateScaler,
} from './deviceInputGeometry.js'
import type { TouchEventSource } from './session.js'
import type { RawUiNode } from './types.js'

export async function getScreenSize(serial: string): Promise<{ width: number; height: number } | undefined> {
  const { stdout } = await runAdb(['-s', serial, 'shell', 'wm', 'size'])
  // Prefer "Override size" (reflects the currently active resolution) and
  // fall back to "Physical size" when no override is set.
  const overrideMatch = /Override size:\s*(\d+)x(\d+)/.exec(stdout)
  const physicalMatch = /Physical size:\s*(\d+)x(\d+)/.exec(stdout)
  const match = overrideMatch ?? physicalMatch
  if (!match) return undefined
  return { width: Number.parseInt(match[1], 10), height: Number.parseInt(match[2], 10) }
}

export interface TouchInputResolution {
  scaler: CoordinateScaler
  /** The touchscreen's /dev/input/eventN node, when it could be determined. */
  devicePath?: string
}

export async function resolveTouchInput(serial: string): Promise<TouchInputResolution> {
  try {
    const [{ stdout: geometryDump }, screenSize] = await Promise.all([
      runAdb(['-s', serial, 'shell', 'getevent', '-pl'], 15_000),
      getScreenSize(serial),
    ])
    const geometry = parseTouchGeometry(geometryDump)
    if (!geometry || !screenSize) {
      logger.warn('Could not determine touch geometry; assuming raw coordinates equal screen pixels', { serial })
      return { scaler: IDENTITY_SCALER }
    }
    return {
      scaler: createCoordinateScaler(geometry, screenSize.width, screenSize.height),
      devicePath: geometry.devicePath,
    }
  } catch (error) {
    logger.warn('Failed to resolve touch coordinate scaling; falling back to identity', {
      serial,
      error: String(error),
    })
    return { scaler: IDENTITY_SCALER }
  }
}

// Spawns `adb shell getevent -lt` (no device argument passed to getevent
// itself: some vendor toolbox builds reject "-lt <device>" as invalid usage
// even though "-lt" alone and "<device>" alone both work - a real,
// device-specific quirk, not a hypothetical). Instead, every device's events
// are multiplexed as before, and lines are filtered by their reported device
// path in JS. This matters because devices commonly expose more than one
// input node (e.g. a touchscreen alongside a stylus/pen digitizer channel
// with its own, unrelated coordinate range) - without filtering, idle/noise
// reports from an unrelated device get fed into the SAME gesture session as
// real touches, corrupting movement tracking (a stationary tap can appear to
// have travelled thousands of units and gets misclassified as a swipe). When
// the touchscreen node couldn't be determined, every device is accepted,
// matching the old behavior.
export function createLiveTouchEventSource(serial: string, devicePath?: string, moveThreshold?: number): TouchEventSource {
  const listeners: Array<(gesture: RawGesture) => void> = []
  const detector = new GestureDetector((gesture) => listeners.forEach((listener) => listener(gesture)), moveThreshold)

  const child = spawn('adb', ['-s', serial, 'shell', 'getevent', '-lt'], { windowsHide: true })
  const rl = createInterface({ input: child.stdout })
  rl.on('line', (line) => {
    const event = parseGeteventLine(line)
    if (event && (!devicePath || event.device === devicePath)) detector.handle(event)
  })
  child.stderr.on('data', (chunk) => logger.warn('getevent stderr', { serial, chunk: chunk.toString() }))
  child.on('error', (error) => logger.error('Failed to spawn adb getevent', { serial, error: String(error) }))

  return {
    onGesture(listener) {
      listeners.push(listener)
    },
    async stop() {
      rl.close()
      child.kill()
      // Best-effort: closing the local adb client doesn't always tear down
      // the remote shell command it was streaming from.
      try {
        await runAdb(['-s', serial, 'shell', 'pkill', '-f', 'getevent'], 5_000)
      } catch {
        // Non-fatal - the remote process will exit on its own when the
        // underlying ADB transport connection drops, on most versions.
      }
    },
  }
}

export function normalizeSnapshot(parsed: unknown): RawUiNode | undefined {
  if (parsed === null || typeof parsed !== 'object') return undefined
  if (Array.isArray(parsed)) return { children: parsed }

  let obj = parsed as Record<string, unknown>

  // `mobilecli dump ui --format json` wraps every CLI subcommand's real
  // payload in a {status, data} envelope - without unwrapping it, `elements`
  // is never found at the top level and every downstream hit-test silently
  // operates on an empty tree, making every recorded action fall back to
  // raw coordinates regardless of what's on screen. Other callers (e.g. the
  // RPC agent's `device.dump.ui`) return the payload unwrapped already, so
  // this only unwraps when the envelope shape is actually present.
  if ('status' in obj && 'data' in obj && obj.data && typeof obj.data === 'object') {
    if (obj.status !== 'ok') return undefined
    obj = obj.data as Record<string, unknown>
  }

  if (Array.isArray(obj.elements)) return { children: obj.elements }
  return obj
}

export async function getUiSnapshot(serial: string): Promise<RawUiNode | undefined> {
  try {
    const { stdout } = await runMobilecli(['dump', 'ui', '--device', serial, '--format', 'json'], 15_000)
    return normalizeSnapshot(JSON.parse(stdout))
  } catch (error) {
    logger.warn('Failed to capture UI snapshot', { serial, error: String(error) })
    return undefined
  }
}

export interface InspectorLocatorSummary {
  kind: string
  value: string
  name?: string
}

export interface InspectorElementSummary {
  resourceId: string | null
  text: string | null
  value: string | null
  label: string | null
  type: string
  bounds: { x: number; y: number; width: number; height: number }
  isEnabled: boolean
  isFocused: boolean | null
  raw?: Record<string, unknown> | null
  locator: InspectorLocatorSummary | null
  locators: InspectorLocatorSummary[]
}

// Key session.ts's RecordedAction locator resolution looks for on a
// synthetic node built by elementsToRawTree, to recognize that a node's
// candidate locators came from the Mobilewright Inspector's own (far more
// reliable) element/locator derivation, not this app's own uiTree.ts +
// locatorEngine.ts - see locator/inspectorLocator.ts.
export const INSPECTOR_LOCATORS_KEY = '__inspectorLocators'

// Sources the element list for gesture hit-testing from the same Inspector
// used by the Live Inspector panel, instead of a separate `mobilecli dump ui`
// call - the Inspector's element/locator derivation is more robust (proper
// bounds parsing, cross-platform role mapping) than this app's own
// uiTree.ts, which was misresolving taps to oversized generic containers.
export async function getInspectorElements(serial: string): Promise<InspectorElementSummary[] | undefined> {
  try {
    const selected = await ensureInspectorDeviceSelected(serial)
    if (!selected) return undefined
    const res = await inspectorFetch('/api/inspect')
    if (!res.ok) {
      logger.warn('Inspector /api/inspect returned a non-OK status while recording', { serial, status: res.status })
      return undefined
    }
    const body = (await res.json()) as { elements?: InspectorElementSummary[] }
    return body.elements
  } catch (error) {
    logger.warn('Failed to fetch elements from the Inspector for recording', { serial, error: String(error) })
    return undefined
  }
}

// Wraps the Inspector's flat element list as a single-level RawUiNode tree so
// it can be fed straight into uiTree.ts's existing findElementAtPoint /
// findFocusedEditableField / collectVisibleTexts - all of which already
// tolerate a flat "root has no bounds, children carry everything" shape.
// Deliberately gives the root no `bounds`: a touch that lands outside every
// known element (e.g. on the on-screen keyboard, which isn't part of the
// app's own accessibility tree) then resolves to no element at all, which
// session.ts uses to recognize - and not record - IME keystroke noise.
export function elementsToRawTree(elements: InspectorElementSummary[] | undefined): RawUiNode | undefined {
  if (!elements) return undefined
  return {
    children: elements.map((el) => ({
      resourceId: el.resourceId ?? undefined,
      text: el.text ?? el.value ?? undefined,
      contentDescription: el.label ?? undefined,
      className: el.type,
      bounds: el.bounds,
      clickable: el.isEnabled,
      isFocused: el.isFocused ?? undefined,
      scrollable: el.raw?.scrollable,
      [INSPECTOR_LOCATORS_KEY]: el.locators,
    })),
  }
}

// Mirrors exactly what the Execution Engine does before running a generated
// script (`@mobilewright/test`'s fixture: terminate then launch the target
// app) so a recording always starts from the same cold-launch state replay
// will reproduce. Without this, recording a flow from mid-session (already
// logged in, already a few screens deep) captures actions replay can never
// reach, since replay always force-relaunches the app first.
export async function relaunchApp(serial: string, bundleId: string): Promise<void> {
  try {
    await runMobilecli(['apps', 'terminate', bundleId, '--device', serial], 10_000)
  } catch (error) {
    // The app may not have been running yet - not fatal, proceed to launch.
    logger.warn('mobilecli apps terminate failed (app may not have been running)', { serial, bundleId, error: String(error) })
  }
  await runMobilecli(['apps', 'launch', bundleId, '--device', serial], 15_000)
}

export async function getForegroundApp(serial: string): Promise<string | undefined> {
  try {
    const { stdout, exitCode } = await runMobilecli(['apps', 'foreground', '--device', serial], 10_000)
    if (exitCode !== 0) {
      // mobilecli reports command failures via a non-zero exit + a JSON
      // error body on stdout, not stderr/rejection - trusting stdout without
      // checking exitCode would treat that error body as the package name.
      logger.warn('mobilecli apps foreground exited non-zero', { serial, exitCode, stdout: stdout.trim() })
      return undefined
    }
    // `apps foreground` always replies with the same {status, data} envelope
    // as every other mobilecli subcommand, e.g.
    // {"status":"ok","data":{"packageName":"com.example.app", ...}} - reading
    // stdout as a bare package name string (as this used to) meant the whole
    // JSON blob got passed through the app-package regex, which never
    // matches it, so the app package silently never got detected.
    const parsed = JSON.parse(stdout) as { status?: string; data?: { packageName?: unknown } }
    if (parsed.status !== 'ok') return undefined
    const packageName = parsed.data?.packageName
    return typeof packageName === 'string' && packageName.length > 0 ? packageName : undefined
  } catch (error) {
    logger.warn('Failed to read foreground app', { serial, error: String(error) })
    return undefined
  }
}
