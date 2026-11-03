import { describe, it, expect } from 'vitest'
import { parseTouchGeometry, createCoordinateScaler } from './deviceInputGeometry.js'

const MULTITOUCH_DUMP = `
add device 1: /dev/input/event3
  name:     "fts_ts"
  events:
    ABS (0003): ABS_MT_SLOT          : value 0, min 0, max 9, fuzz 0, flat 0, resolution 0
                ABS_MT_TOUCH_MAJOR   : value 0, min 0, max 255, fuzz 0, flat 0, resolution 0
                ABS_MT_POSITION_X    : value 0, min 0, max 1079, fuzz 0, flat 0, resolution 0
                ABS_MT_POSITION_Y    : value 0, min 0, max 2339, fuzz 0, flat 0, resolution 0
                ABS_MT_TRACKING_ID   : value 0, min 0, max 65535, fuzz 0, flat 0, resolution 0
  input props:
    INPUT_PROP_DIRECT
`

const SINGLE_TOUCH_DUMP = `
add device 1: /dev/input/event2
  name:     "old-touchscreen"
  events:
    ABS (0003): ABS_X                 : value 0, min 0, max 4095, fuzz 0, flat 0, resolution 0
                ABS_Y                 : value 0, min 0, max 4095, fuzz 0, flat 0, resolution 0
`

// A real-world dump from a device with two ABS_X/ABS_Y-reporting nodes: a
// stylus/pen digitizer channel (unrelated coordinate range, no
// ABS_MT_POSITION_*) listed BEFORE the actual multitouch touchscreen.
const PEN_AND_TOUCHSCREEN_DUMP = `
add device 3: /dev/input/event3
  name:     "fts_ts,pen"
  events:
    KEY (0001): BTN_DIGI              BTN_TOUCH             BTN_STYLUS            BTN_STYLUS2
    ABS (0003): ABS_X                 : value 0, min 0, max 10809, fuzz 0, flat 0, resolution 0
                ABS_Y                 : value 0, min 0, max 24009, fuzz 0, flat 0, resolution 0
                ABS_Z                 : value 0, min 0, max 36000, fuzz 0, flat 0, resolution 0
  input props:
    INPUT_PROP_DIRECT
add device 5: /dev/input/event2
  name:     "fts_ts"
  events:
    ABS (0003): ABS_MT_SLOT           : value 0, min 0, max 9, fuzz 0, flat 0, resolution 0
                ABS_MT_POSITION_X     : value 0, min 0, max 1080, fuzz 0, flat 0, resolution 0
                ABS_MT_POSITION_Y     : value 0, min 0, max 2400, fuzz 0, flat 0, resolution 0
                ABS_MT_TRACKING_ID    : value 0, min 0, max 65535, fuzz 0, flat 0, resolution 0
  input props:
    INPUT_PROP_DIRECT
`

describe('parseTouchGeometry', () => {
  it('parses a multitouch (Type B) device dump', () => {
    expect(parseTouchGeometry(MULTITOUCH_DUMP)).toEqual({
      rangeX: { min: 0, max: 1079 },
      rangeY: { min: 0, max: 2339 },
      protocol: 'multitouch',
      devicePath: '/dev/input/event3',
    })
  })

  it('falls back to ABS_X/ABS_Y for single-touch (Type A) devices', () => {
    expect(parseTouchGeometry(SINGLE_TOUCH_DUMP)).toEqual({
      rangeX: { min: 0, max: 4095 },
      rangeY: { min: 0, max: 4095 },
      protocol: 'single-touch',
      devicePath: '/dev/input/event2',
    })
  })

  it('returns null when no recognizable touch axes are present', () => {
    expect(parseTouchGeometry('add device 1: /dev/input/event0\n  name: "gpio-keys"\n')).toBeNull()
  })

  it('picks the real multitouch touchscreen over an unrelated stylus/pen digitizer that also reports ABS_X/ABS_Y', () => {
    expect(parseTouchGeometry(PEN_AND_TOUCHSCREEN_DUMP)).toEqual({
      rangeX: { min: 0, max: 1080 },
      rangeY: { min: 0, max: 2400 },
      protocol: 'multitouch',
      devicePath: '/dev/input/event2',
    })
  })
})

describe('createCoordinateScaler', () => {
  it('scales raw digitizer coordinates to screen pixels', () => {
    const geometry = {
      rangeX: { min: 0, max: 1079 },
      rangeY: { min: 0, max: 2339 },
      protocol: 'multitouch' as const,
      devicePath: '/dev/input/event3',
    }
    const scale = createCoordinateScaler(geometry, 1080, 2340)
    expect(scale(0, 0)).toEqual({ x: 0, y: 0 })
    expect(scale(1079, 2339)).toEqual({ x: 1080, y: 2340 })
    expect(scale(539, 1169)).toEqual({ x: 539, y: 1169 })
  })

  it('handles a non-zero minimum offset', () => {
    const geometry = {
      rangeX: { min: 100, max: 600 },
      rangeY: { min: 0, max: 500 },
      protocol: 'single-touch' as const,
      devicePath: '/dev/input/event2',
    }
    const scale = createCoordinateScaler(geometry, 500, 1000)
    expect(scale(100, 0)).toEqual({ x: 0, y: 0 })
    expect(scale(600, 500)).toEqual({ x: 500, y: 1000 })
  })
})
