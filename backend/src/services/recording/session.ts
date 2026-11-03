import { randomUUID } from 'node:crypto'
import type { RawGesture } from './gestureDetector.js'
import {
  findElementAtPoint,
  extractElementInfo,
  findFocusedEditableField,
  editableFieldKey,
  collectVisibleTexts,
} from './uiTree.js'
import type {
  RecordedAction,
  RecordedActionType,
  RecordingSession as RecordingSessionData,
  ElementInfo,
  RawUiNode,
} from './types.js'
import type { CoordinateScaler } from './deviceInputGeometry.js'
import { rankLocators } from '../locator/locatorEngine.js'
import { inspectorLocatorSuggestion } from '../locator/inspectorLocator.js'

export interface TouchEventSource {
  onGesture(listener: (gesture: RawGesture) => void): void
  stop(): Promise<void>
}

export type SnapshotProvider = () => Promise<RawUiNode | undefined>
export type ForegroundAppProvider = () => Promise<string | undefined>

export interface RecordingSessionDeps {
  deviceSerial: string
  eventSource: TouchEventSource
  scaler: CoordinateScaler
  getSnapshot: SnapshotProvider
  getForegroundApp?: ForegroundAppProvider
  onAction?: (action: RecordedAction) => void
  onError?: (error: unknown) => void
}

function classifyGestureType(gesture: RawGesture, element: ElementInfo | undefined): RecordedActionType {
  switch (gesture.kind) {
    case 'tap':
      return 'tap'
    case 'long_press':
      return 'long_press'
    case 'back_key':
      return 'back'
    case 'swipe':
      return element?.raw?.scrollable === true ? 'scroll' : 'swipe'
    default:
      return 'unknown_gesture'
  }
}

interface FocusedFieldState {
  key: string
  initialText: string | undefined
  latest: ElementInfo
}

// Android's on-screen keyboard exposes its own keys as real, hit-testable
// accessibility elements - a keystroke doesn't land on "nothing". Every
// keyboard observed in practice (AOSP, Gboard, SwiftKey, Samsung Keyboard,
// Ridmik Keyboard) names its key/container view classes or resource-ids with
// "inputmethod" or "keyboard", so that distinguishes an IME keystroke from a
// real tap on the app itself.
const IME_ELEMENT_PATTERN = /inputmethod|keyboard/i

function isImeElement(element: ElementInfo | undefined): boolean {
  if (!element) return false
  return IME_ELEMENT_PATTERN.test(element.className ?? '') || IME_ELEMENT_PATTERN.test(element.resourceId ?? '')
}

// Orchestrates one recording session: turns a raw gesture stream + on-demand
// UI snapshots into structured RecordedActions. Depends only on the
// TouchEventSource/SnapshotProvider interfaces so it can be exercised with
// fakes in tests - the real ADB/mobilecli wiring lives in liveCapture.ts.
export class RecordingSession {
  readonly data: RecordingSessionData
  private lastSnapshot: RawUiNode | undefined
  private lastForegroundApp: string | undefined
  private queue: Promise<unknown> = Promise.resolve()
  // Tracks the single editable field currently focused, across as many
  // gestures as it takes to type into it - a text_input/clear_input action
  // is only ever emitted once focus moves away (see checkFocusChange), not
  // once per keystroke-triggered gesture.
  private focusedField: FocusedFieldState | null = null

  constructor(private readonly deps: RecordingSessionDeps) {
    this.data = {
      id: randomUUID(),
      deviceSerial: deps.deviceSerial,
      startedAt: new Date().toISOString(),
      status: 'recording',
      actions: [],
    }
    this.deps.eventSource.onGesture((gesture) => this.enqueue(gesture))
  }

  private enqueue(gesture: RawGesture): void {
    this.queue = this.queue.then(() => this.processGesture(gesture)).catch((error) => this.deps.onError?.(error))
  }

  private async processGesture(gesture: RawGesture): Promise<void> {
    const before = this.lastSnapshot ?? (await this.deps.getSnapshot())
    const beforeForegroundApp = this.lastForegroundApp
    const start = this.deps.scaler(gesture.x, gesture.y)
    const end =
      gesture.endX !== undefined && gesture.endY !== undefined
        ? this.deps.scaler(gesture.endX, gesture.endY)
        : undefined

    const targetNode = before ? findElementAtPoint(before, start.x, start.y) : undefined
    const element = targetNode ? extractElementInfo(targetNode) : undefined

    const after = await this.deps.getSnapshot()
    this.lastSnapshot = after

    // Foreground-app detection is a separate, slow ADB/mobilecli round trip
    // that rarely changes mid-gesture - blocking every single gesture on it
    // (as this used to) was a major source of recording lag. It's kicked off
    // in the background instead: this action's screenAfter uses whatever was
    // last known, and the fresh value lands in time for a later action.
    const afterForegroundApp = this.lastForegroundApp
    if (this.deps.getForegroundApp) {
      void this.deps
        .getForegroundApp()
        .then((app) => {
          this.lastForegroundApp = app
        })
        .catch(() => undefined)
    }

    // Captured before checkFocusChange (which may clear it) so the very
    // keystroke that ends a typing session - e.g. tapping the keyboard's
    // "Done"/"Search" action key - is still recognized as IME noise below,
    // not just the keystrokes in the middle of it.
    const wasTypingBeforeThisGesture = this.focusedField !== null

    const flushedTextChange = this.checkFocusChange(after)
    if (flushedTextChange) this.emit(flushedTextChange)

    // A tap/long-press on the on-screen keyboard (or hitting no element at
    // all) while a field was being tracked as focused is a keystroke, not a
    // real interaction with the app. Recording one of these per keystroke
    // used to bury the single, clean text_input step this typing session
    // already produces (via checkFocusChange above) under a pile of
    // meaningless "Tap" actions.
    const isLikelyImeNoise =
      wasTypingBeforeThisGesture &&
      (gesture.kind === 'tap' || gesture.kind === 'long_press') &&
      (!element || isImeElement(element))
    if (isLikelyImeNoise) return

    const now = new Date().toISOString()

    // A back-key press isn't a locator-based interaction (no element was
    // targeted), so no locator suggestion is computed for it. Otherwise,
    // prefer the Inspector's own locator derivation (more reliable element
    // resolution and locator ranking - see locator/inspectorLocator.ts) when
    // the snapshot came from it, falling back to the tree-based
    // locatorEngine.ts when it didn't.
    const locator =
      gesture.kind === 'back_key'
        ? undefined
        : (inspectorLocatorSuggestion(element, start) ??
          rankLocators({ element, tree: before, node: targetNode, point: start }))

    this.emit({
      id: randomUUID(),
      timestamp: now,
      type: classifyGestureType(gesture, element),
      x: start.x,
      y: start.y,
      endX: end?.x,
      endY: end?.y,
      direction: gesture.direction,
      durationMs: gesture.durationMs,
      element,
      locator,
      screenBefore: {
        timestamp: now,
        foregroundApp: beforeForegroundApp,
        visibleTexts: before ? collectVisibleTexts(before) : undefined,
      },
      screenAfter: {
        timestamp: now,
        foregroundApp: afterForegroundApp,
        visibleTexts: after ? collectVisibleTexts(after) : undefined,
      },
    })
  }

  private emit(action: RecordedAction): void {
    this.data.actions.push(action)
    this.deps.onAction?.(action)
  }

  // Compares the field focused in `tree` (if any) against the one this
  // session was tracking. Returns a text_input/clear_input action for the
  // PREVIOUSLY tracked field when focus has moved to a different field (or
  // to none) since it changed - the new field, if any, then starts being
  // tracked. Returns null while the same field stays focused (still typing).
  private checkFocusChange(tree: RawUiNode | undefined): RecordedAction | null {
    const current = findFocusedEditableField(tree)
    const currentKey = current ? editableFieldKey(current) : undefined

    let flushed: RecordedAction | null = null
    if (this.focusedField && this.focusedField.key !== currentKey) {
      flushed = this.buildTextChangeAction(this.focusedField)
      this.focusedField = null
    }

    if (current && currentKey) {
      if (this.focusedField?.key === currentKey) {
        this.focusedField.latest = current
      } else {
        this.focusedField = { key: currentKey, initialText: current.text, latest: current }
      }
    }

    return flushed
  }

  private buildTextChangeAction(field: FocusedFieldState): RecordedAction | null {
    if (field.latest.text === field.initialText) return null
    return {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: field.latest.text ? 'text_input' : 'clear_input',
      text: field.latest.text,
      element: field.latest,
    }
  }

  async stop(): Promise<RecordingSessionData> {
    await this.queue.catch(() => undefined)
    await this.deps.eventSource.stop()

    // Catches text typed after the last gesture with no further gesture to
    // trigger a focus-change flush - e.g. the user types then immediately
    // clicks "Stop Recording". Only worth an extra snapshot when a field is
    // actually being tracked.
    if (this.focusedField) {
      const finalSnapshot = await this.deps.getSnapshot().catch(() => undefined)
      const flushedOnFocusChange = this.checkFocusChange(finalSnapshot)
      if (flushedOnFocusChange) this.emit(flushedOnFocusChange)
      if (this.focusedField) {
        const flushed = this.buildTextChangeAction(this.focusedField)
        if (flushed) this.emit(flushed)
        this.focusedField = null
      }
    }

    this.data.status = 'stopped'
    this.data.stoppedAt = new Date().toISOString()
    return this.data
  }
}
