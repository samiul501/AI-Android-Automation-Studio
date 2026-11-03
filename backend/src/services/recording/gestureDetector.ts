import { type InputEvent, TRACKING_ID_RELEASED } from './touchEventParser.js'

export type GestureKind = 'tap' | 'long_press' | 'swipe' | 'back_key'
export type SwipeDirection = 'up' | 'down' | 'left' | 'right'

export interface RawGesture {
  kind: GestureKind
  x: number
  y: number
  endX?: number
  endY?: number
  direction?: SwipeDirection
  durationMs: number
  startedAtSec: number
  endedAtSec: number
}

const DEFAULT_LONG_PRESS_MS = 500

interface TouchSession {
  startX: number
  startY: number
  startTimeSec: number
  maxDeviation: number
}

function computeDirection(x0: number, y0: number, x1: number, y1: number): SwipeDirection {
  const dx = x1 - x0
  const dy = y1 - y0
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

// Consumes a raw evdev event stream (both multitouch "Type B" protocol -
// ABS_MT_TRACKING_ID/POSITION_X/Y - and single-touch "Type A" - ABS_X/ABS_Y +
// BTN_TOUCH) and classifies each contact as a tap, long-press, or swipe based
// on movement distance and hold duration. Also reports EV_KEY KEY_BACK
// presses; devices using gesture navigation (no physical/virtual back key)
// won't emit this and back-navigation won't be distinguishable from a swipe.
export class GestureDetector {
  private session: TouchSession | null = null
  private currentX: number | null = null
  private currentY: number | null = null
  private backKeyDownAtSec: number | null = null
  // A start signal (BTN_TOUCH DOWN / tracking-id assigned) can arrive before
  // the position report in the same event frame, depending on the device.
  private touchRequestedAtSec: number | null = null

  constructor(
    private readonly onGesture: (gesture: RawGesture) => void,
    private readonly moveThreshold = 24,
    private readonly longPressMs = DEFAULT_LONG_PRESS_MS,
  ) {}

  handle(event: InputEvent): void {
    if (event.type === 'EV_KEY' && event.code === 'KEY_BACK') {
      this.handleBackKey(event.value, event.timestampSec)
      return
    }

    if (event.type === 'EV_ABS' && (event.code === 'ABS_MT_POSITION_X' || event.code === 'ABS_X')) {
      this.currentX = event.value
      this.tryStartPendingSession()
      this.updateSession()
      return
    }

    if (event.type === 'EV_ABS' && (event.code === 'ABS_MT_POSITION_Y' || event.code === 'ABS_Y')) {
      this.currentY = event.value
      this.tryStartPendingSession()
      this.updateSession()
      return
    }

    if (event.type === 'EV_ABS' && event.code === 'ABS_MT_TRACKING_ID') {
      if (event.value === TRACKING_ID_RELEASED) this.endTouch(event.timestampSec)
      else this.startTouch(event.timestampSec)
      return
    }

    if (event.type === 'EV_KEY' && event.code === 'BTN_TOUCH') {
      if (event.value === 1) this.startTouch(event.timestampSec)
      else this.endTouch(event.timestampSec)
    }
  }

  private handleBackKey(value: number, timestampSec: number): void {
    if (value === 1) {
      this.backKeyDownAtSec = timestampSec
      return
    }
    if (this.backKeyDownAtSec === null) return
    const startedAtSec = this.backKeyDownAtSec
    this.backKeyDownAtSec = null
    this.onGesture({
      kind: 'back_key',
      x: 0,
      y: 0,
      durationMs: Math.round((timestampSec - startedAtSec) * 1000),
      startedAtSec,
      endedAtSec: timestampSec,
    })
  }

  private startTouch(timestampSec: number): void {
    if (this.session) return
    // currentX/currentY may still hold the PREVIOUS touch's last reported
    // position - evdev doesn't necessarily resend a fresh position report
    // before a new contact's tracking id / BTN_TOUCH DOWN arrives, and these
    // fields are never cleared on touch-up. Without resetting them here,
    // tryStartPendingSession can anchor this NEW touch's start point on
    // wherever the PREVIOUS touch happened to end, so two ordinary back-to-
    // back taps at different screen locations get recorded as one giant
    // "swipe" from the first tap's position to the second's.
    this.currentX = null
    this.currentY = null
    this.touchRequestedAtSec = timestampSec
    this.tryStartPendingSession()
  }

  private tryStartPendingSession(): void {
    if (this.session || this.touchRequestedAtSec === null) return
    if (this.currentX === null || this.currentY === null) return
    this.session = {
      startX: this.currentX,
      startY: this.currentY,
      startTimeSec: this.touchRequestedAtSec,
      maxDeviation: 0,
    }
    this.touchRequestedAtSec = null
  }

  private updateSession(): void {
    if (!this.session || this.currentX === null || this.currentY === null) return
    const deviation = Math.hypot(this.currentX - this.session.startX, this.currentY - this.session.startY)
    this.session.maxDeviation = Math.max(this.session.maxDeviation, deviation)
  }

  private endTouch(timestampSec: number): void {
    this.touchRequestedAtSec = null
    if (!this.session) return
    const { startX, startY, startTimeSec, maxDeviation } = this.session
    const endX = this.currentX ?? startX
    const endY = this.currentY ?? startY
    const durationMs = Math.round((timestampSec - startTimeSec) * 1000)
    this.session = null

    if (maxDeviation < this.moveThreshold) {
      this.onGesture({
        kind: durationMs >= this.longPressMs ? 'long_press' : 'tap',
        x: startX,
        y: startY,
        durationMs,
        startedAtSec: startTimeSec,
        endedAtSec: timestampSec,
      })
      return
    }

    this.onGesture({
      kind: 'swipe',
      x: startX,
      y: startY,
      endX,
      endY,
      direction: computeDirection(startX, startY, endX, endY),
      durationMs,
      startedAtSec: startTimeSec,
      endedAtSec: timestampSec,
    })
  }
}
