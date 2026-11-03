import { describe, it, expect, vi } from 'vitest'
import { RecordingSession, type TouchEventSource, type SnapshotProvider } from './session.js'
import type { RawGesture } from './gestureDetector.js'
import type { RawUiNode } from './types.js'

class FakeEventSource implements TouchEventSource {
  private listener: ((gesture: RawGesture) => void) | null = null
  stopped = false

  onGesture(listener: (gesture: RawGesture) => void): void {
    this.listener = listener
  }

  fire(gesture: RawGesture): void {
    this.listener?.(gesture)
  }

  async stop(): Promise<void> {
    this.stopped = true
  }
}

const IDENTITY_SCALER = (x: number, y: number) => ({ x, y })

function tap(x: number, y: number): RawGesture {
  return { kind: 'tap', x, y, durationMs: 80, startedAtSec: 0, endedAtSec: 0.08 }
}

describe('RecordingSession', () => {
  it('starts in "recording" status with an empty action list', () => {
    const session = new RecordingSession({
      deviceSerial: 'ABC123',
      eventSource: new FakeEventSource(),
      scaler: IDENTITY_SCALER,
      getSnapshot: async () => undefined,
    })
    expect(session.data.status).toBe('recording')
    expect(session.data.actions).toEqual([])
    expect(session.data.deviceSerial).toBe('ABC123')
  })

  it('records a tap and attaches the element found at the tap point in the "before" snapshot', async () => {
    const source = new FakeEventSource()
    const snapshot: RawUiNode = {
      bounds: { x: 0, y: 0, width: 1080, height: 2340 },
      children: [
        { bounds: { x: 400, y: 2000, width: 200, height: 80 }, 'resource-id': 'com.example:id/login', text: 'Log in' },
      ],
    }
    const session = new RecordingSession({
      deviceSerial: 'ABC123',
      eventSource: source,
      scaler: IDENTITY_SCALER,
      getSnapshot: async () => snapshot,
    })

    source.fire(tap(500, 2020))
    await session.stop()

    expect(session.data.actions).toHaveLength(1)
    expect(session.data.actions[0]).toMatchObject({
      type: 'tap',
      x: 500,
      y: 2020,
      element: { resourceId: 'com.example:id/login' },
    })
    expect(session.data.actions[0].locator?.best).toMatchObject({
      strategy: 'testId',
      expression: "getByTestId('com.example:id/login')",
    })
  })

  it('does not compute a locator for a back-key press (no element was targeted)', async () => {
    const source = new FakeEventSource()
    const session = new RecordingSession({
      deviceSerial: 'ABC123',
      eventSource: source,
      scaler: IDENTITY_SCALER,
      getSnapshot: async () => undefined,
    })

    source.fire({ kind: 'back_key', x: 0, y: 0, durationMs: 50, startedAtSec: 0, endedAtSec: 0.05 })
    await session.stop()

    expect(session.data.actions[0].type).toBe('back')
    expect(session.data.actions[0].locator).toBeUndefined()
  })

  describe('text input capture', () => {
    function screenWith(field: Record<string, unknown>): RawUiNode {
      return { bounds: { x: 0, y: 0, width: 1080, height: 2340 }, children: [field] }
    }

    function snapshotSequence(snapshots: RawUiNode[]) {
      let call = 0
      return async () => snapshots[Math.min(call++, snapshots.length - 1)]
    }

    it('flushes one coalesced text_input action, before the gesture that moved focus away', async () => {
      const source = new FakeEventSource()
      const getSnapshot = snapshotSequence([
        screenWith({ 'resource-id': 'com.example:id/email', class: 'EditText', text: '', focused: false }),
        screenWith({ 'resource-id': 'com.example:id/email', class: 'EditText', text: '', focused: true }),
        screenWith({ 'resource-id': 'com.example:id/email', class: 'EditText', text: 'hi', focused: true }),
        screenWith({ 'resource-id': 'com.example:id/email', class: 'EditText', text: 'hi', focused: false }),
      ])
      const session = new RecordingSession({ deviceSerial: 'ABC123', eventSource: source, scaler: IDENTITY_SCALER, getSnapshot })

      source.fire(tap(10, 10)) // focuses the field
      source.fire(tap(20, 20)) // still typing (text updates while still focused)
      source.fire(tap(30, 30)) // moves focus away (e.g. taps "submit")
      await session.stop()

      expect(session.data.actions.map((a) => a.type)).toEqual(['tap', 'tap', 'text_input', 'tap'])
      expect(session.data.actions[2].text).toBe('hi')
    })

    it('does not emit anything if a focused field is left unchanged', async () => {
      const source = new FakeEventSource()
      const getSnapshot = snapshotSequence([
        screenWith({ 'resource-id': 'com.example:id/email', class: 'EditText', text: '', focused: false }),
        screenWith({ 'resource-id': 'com.example:id/email', class: 'EditText', text: '', focused: true }),
        screenWith({ 'resource-id': 'com.example:id/email', class: 'EditText', text: '', focused: false }),
      ])
      const session = new RecordingSession({ deviceSerial: 'ABC123', eventSource: source, scaler: IDENTITY_SCALER, getSnapshot })

      source.fire(tap(10, 10))
      source.fire(tap(20, 20))
      await session.stop()

      expect(session.data.actions.map((a) => a.type)).toEqual(['tap', 'tap'])
    })

    it('flushes a pending text change on stop(), even with no further gesture', async () => {
      const source = new FakeEventSource()
      const getSnapshot = snapshotSequence([
        screenWith({ 'resource-id': 'com.example:id/search', class: 'SearchView', text: '', focused: false }),
        screenWith({ 'resource-id': 'com.example:id/search', class: 'SearchView', text: '', focused: true }),
        // stop()'s own extra snapshot is what catches this - no further gesture fires after focusing.
        screenWith({ 'resource-id': 'com.example:id/search', class: 'SearchView', text: 'shoes', focused: true }),
      ])
      const session = new RecordingSession({ deviceSerial: 'ABC123', eventSource: source, scaler: IDENTITY_SCALER, getSnapshot })

      source.fire(tap(10, 10))
      await session.stop()

      expect(session.data.actions.map((a) => a.type)).toEqual(['tap', 'text_input'])
      expect(session.data.actions[1].text).toBe('shoes')
    })

    it('does not record a tap that hits no element while a field is focused (an on-screen-keyboard keystroke)', async () => {
      const source = new FakeEventSource()
      // The focused field's own bounds cover just its own box, unlike
      // screenWith's full-screen root - a keystroke tap (e.g. at 900,900,
      // over the on-screen keyboard) then genuinely resolves to no element,
      // exactly as it would with a real Inspector-sourced snapshot.
      const fieldBounds = { x: 0, y: 0, width: 400, height: 50 }
      const getSnapshot = snapshotSequence([
        { children: [{ 'resource-id': 'com.example:id/search', class: 'SearchView', bounds: fieldBounds, text: '', focused: false }] },
        { children: [{ 'resource-id': 'com.example:id/search', class: 'SearchView', bounds: fieldBounds, text: '', focused: true }] },
        { children: [{ 'resource-id': 'com.example:id/search', class: 'SearchView', bounds: fieldBounds, text: 's', focused: true }] },
        { children: [{ 'resource-id': 'com.example:id/search', class: 'SearchView', bounds: fieldBounds, text: 'shoes', focused: true }] },
      ])
      const session = new RecordingSession({ deviceSerial: 'ABC123', eventSource: source, scaler: IDENTITY_SCALER, getSnapshot })

      source.fire(tap(10, 10)) // taps the field itself - focuses it
      source.fire(tap(900, 900)) // a keystroke on the on-screen keyboard - no element under it
      await session.stop()

      expect(session.data.actions.map((a) => a.type)).toEqual(['tap', 'text_input'])
      expect(session.data.actions[1].text).toBe('shoes')
    })

    it('does not record a tap on a real on-screen-keyboard key element while a field is focused', async () => {
      // Real devices (unlike the "no element" case above) do expose the
      // keyboard's own keys as hit-testable accessibility elements - this
      // reproduces that: the keystroke tap resolves to an actual element,
      // just one that belongs to the keyboard, not the app.
      const source = new FakeEventSource()
      const fieldBounds = { x: 0, y: 0, width: 400, height: 50 }
      const keyBounds = { x: 750, y: 1560, width: 110, height: 180 }
      const getSnapshot = snapshotSequence([
        { children: [{ 'resource-id': 'com.example:id/search', class: 'SearchView', bounds: fieldBounds, text: '', focused: false }] },
        { children: [{ 'resource-id': 'com.example:id/search', class: 'SearchView', bounds: fieldBounds, text: '', focused: true }] },
        {
          children: [
            { 'resource-id': 'com.example:id/search', class: 'SearchView', bounds: fieldBounds, text: 'hi', focused: true },
            { class: 'com.android.inputmethod.keyboard.a', 'content-desc': 'i', bounds: keyBounds },
          ],
        },
      ])
      const session = new RecordingSession({ deviceSerial: 'ABC123', eventSource: source, scaler: IDENTITY_SCALER, getSnapshot })

      source.fire(tap(10, 10)) // taps the field itself - focuses it
      source.fire(tap(800, 1600)) // taps the "i" key element
      await session.stop()

      expect(session.data.actions.map((a) => a.type)).toEqual(['tap', 'text_input'])
      expect(session.data.actions[1].text).toBe('hi')
    })

    it('tracks a field with no resource-id via its className and bounds', async () => {
      const source = new FakeEventSource()
      const bounds = { x: 0, y: 0, width: 400, height: 50 }
      const getSnapshot = snapshotSequence([
        screenWith({ class: 'android.widget.SearchView', bounds, text: '', focused: false }),
        screenWith({ class: 'android.widget.SearchView', bounds, text: '', focused: true }),
        screenWith({ class: 'android.widget.SearchView', bounds, text: 'shoes', focused: true }),
      ])
      const session = new RecordingSession({ deviceSerial: 'ABC123', eventSource: source, scaler: IDENTITY_SCALER, getSnapshot })

      source.fire(tap(10, 10))
      await session.stop()

      expect(session.data.actions.map((a) => a.type)).toEqual(['tap', 'text_input'])
      expect(session.data.actions[1].text).toBe('shoes')
    })
  })

  it('reuses the previous "after" snapshot as the next gesture\'s "before" snapshot (only one dump per gesture)', async () => {
    const source = new FakeEventSource()
    const getSnapshot = vi.fn<SnapshotProvider>(async () => ({
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      children: [],
    }))
    const session = new RecordingSession({
      deviceSerial: 'ABC123',
      eventSource: source,
      scaler: IDENTITY_SCALER,
      getSnapshot,
    })

    source.fire(tap(1, 1))
    source.fire(tap(2, 2))
    await session.stop()

    // First gesture: no prior snapshot, so it dumps twice (before + after).
    // Second gesture: reuses the first's "after" as its "before", so it only dumps once more.
    expect(getSnapshot).toHaveBeenCalledTimes(3)
  })

  it('marks the session stopped and records a stoppedAt timestamp', async () => {
    const session = new RecordingSession({
      deviceSerial: 'ABC123',
      eventSource: new FakeEventSource(),
      scaler: IDENTITY_SCALER,
      getSnapshot: async () => undefined,
    })
    const stopped = await session.stop()
    expect(stopped.status).toBe('stopped')
    expect(stopped.stoppedAt).toBeDefined()
  })

  it('classifies a swipe over a scrollable element as "scroll" instead of "swipe"', async () => {
    const source = new FakeEventSource()
    const snapshot: RawUiNode = {
      bounds: { x: 0, y: 0, width: 1080, height: 2340 },
      children: [
        { bounds: { x: 0, y: 100, width: 1080, height: 2000 }, 'resource-id': 'com.example:id/list', scrollable: true },
      ],
    }
    const session = new RecordingSession({
      deviceSerial: 'ABC123',
      eventSource: source,
      scaler: IDENTITY_SCALER,
      getSnapshot: async () => snapshot,
    })

    source.fire({
      kind: 'swipe',
      x: 500,
      y: 1800,
      endX: 500,
      endY: 600,
      direction: 'up',
      durationMs: 100,
      startedAtSec: 0,
      endedAtSec: 0.1,
    })
    await session.stop()

    expect(session.data.actions[0].type).toBe('scroll')
  })
})
