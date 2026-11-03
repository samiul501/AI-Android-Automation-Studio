import { describe, it, expect } from 'vitest'
import { GestureDetector, type RawGesture } from './gestureDetector.js'
import type { InputEvent } from './touchEventParser.js'

function abs(code: string, value: number, t: number): InputEvent {
  return { timestampSec: t, device: '/dev/input/event3', type: 'EV_ABS', code, rawValue: value.toString(16), value }
}

function key(code: string, value: number, t: number): InputEvent {
  return { timestampSec: t, device: '/dev/input/event3', type: 'EV_KEY', code, rawValue: value ? 'DOWN' : 'UP', value }
}

function collect(feed: (detector: GestureDetector) => void, moveThreshold = 24, longPressMs = 500): RawGesture[] {
  const gestures: RawGesture[] = []
  const detector = new GestureDetector((g) => gestures.push(g), moveThreshold, longPressMs)
  feed(detector)
  return gestures
}

describe('GestureDetector - multitouch (Type B) protocol', () => {
  it('classifies a short, stationary contact as a tap', () => {
    const gestures = collect((d) => {
      d.handle(abs('ABS_MT_TRACKING_ID', 1, 0))
      d.handle(abs('ABS_MT_POSITION_X', 500, 0))
      d.handle(abs('ABS_MT_POSITION_Y', 800, 0))
      d.handle(abs('ABS_MT_TRACKING_ID', 0xffffffff, 0.08))
    })
    expect(gestures).toEqual([expect.objectContaining({ kind: 'tap', x: 500, y: 800, durationMs: 80 })])
  })

  it('classifies a stationary contact held past the long-press threshold as a long_press', () => {
    const gestures = collect((d) => {
      d.handle(abs('ABS_MT_TRACKING_ID', 1, 0))
      d.handle(abs('ABS_MT_POSITION_X', 200, 0))
      d.handle(abs('ABS_MT_POSITION_Y', 300, 0))
      d.handle(abs('ABS_MT_TRACKING_ID', 0xffffffff, 0.7))
    })
    expect(gestures[0].kind).toBe('long_press')
    expect(gestures[0].durationMs).toBeCloseTo(700, 0)
  })

  it('classifies a large-movement contact as a swipe with computed direction', () => {
    const gestures = collect((d) => {
      d.handle(abs('ABS_MT_TRACKING_ID', 1, 0))
      d.handle(abs('ABS_MT_POSITION_X', 500, 0))
      d.handle(abs('ABS_MT_POSITION_Y', 1800, 0))
      d.handle(abs('ABS_MT_POSITION_X', 500, 0.05))
      d.handle(abs('ABS_MT_POSITION_Y', 600, 0.05))
      d.handle(abs('ABS_MT_TRACKING_ID', 0xffffffff, 0.1))
    })
    expect(gestures).toEqual([
      expect.objectContaining({ kind: 'swipe', x: 500, y: 1800, endX: 500, endY: 600, direction: 'up' }),
    ])
  })

  it('classifies two consecutive stationary taps at different locations as two taps, not a swipe between them', () => {
    // Real touch controllers don't necessarily resend ABS_MT_POSITION_X/Y on
    // release - only the down position is reported - so currentX/currentY
    // are still holding the FIRST tap's coordinates when the second tap's
    // tracking id arrives. Without resetting them, the second tap's session
    // would incorrectly start at the first tap's location.
    const gestures = collect((d) => {
      d.handle(abs('ABS_MT_TRACKING_ID', 1, 0))
      d.handle(abs('ABS_MT_POSITION_X', 100, 0))
      d.handle(abs('ABS_MT_POSITION_Y', 200, 0))
      d.handle(abs('ABS_MT_TRACKING_ID', 0xffffffff, 0.05))

      d.handle(abs('ABS_MT_TRACKING_ID', 2, 0.2))
      d.handle(abs('ABS_MT_POSITION_X', 900, 0.2))
      d.handle(abs('ABS_MT_POSITION_Y', 1800, 0.2))
      d.handle(abs('ABS_MT_TRACKING_ID', 0xffffffff, 0.25))
    })
    expect(gestures).toEqual([
      expect.objectContaining({ kind: 'tap', x: 100, y: 200 }),
      expect.objectContaining({ kind: 'tap', x: 900, y: 1800 }),
    ])
  })

  it('ignores a second touch start while one is already active (avoids double-counting BTN_TOUCH + tracking id on the same contact)', () => {
    const gestures = collect((d) => {
      d.handle(abs('ABS_MT_TRACKING_ID', 1, 0))
      d.handle(abs('ABS_MT_POSITION_X', 10, 0))
      d.handle(abs('ABS_MT_POSITION_Y', 10, 0))
      d.handle(key('BTN_TOUCH', 1, 0)) // same physical contact, redundant start signal
      d.handle(abs('ABS_MT_TRACKING_ID', 0xffffffff, 0.05))
      d.handle(key('BTN_TOUCH', 0, 0.05)) // redundant end signal
    })
    expect(gestures).toHaveLength(1)
  })
})

describe('GestureDetector - single-touch (Type A) protocol fallback', () => {
  it('classifies a tap using ABS_X/ABS_Y + BTN_TOUCH', () => {
    const gestures = collect((d) => {
      d.handle(key('BTN_TOUCH', 1, 0))
      d.handle(abs('ABS_X', 300, 0))
      d.handle(abs('ABS_Y', 400, 0))
      d.handle(key('BTN_TOUCH', 0, 0.1))
    })
    expect(gestures).toEqual([expect.objectContaining({ kind: 'tap', x: 300, y: 400 })])
  })
})

describe('GestureDetector - back key', () => {
  it('reports a back_key gesture on KEY_BACK down/up', () => {
    const gestures = collect((d) => {
      d.handle(key('KEY_BACK', 1, 5))
      d.handle(key('KEY_BACK', 0, 5.05))
    })
    expect(gestures).toEqual([expect.objectContaining({ kind: 'back_key', durationMs: 50 })])
  })
})
