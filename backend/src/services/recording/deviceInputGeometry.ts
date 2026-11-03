// Parses `adb shell getevent -pl` output to discover the touchscreen's raw
// coordinate range, e.g.:
//   add device 1: /dev/input/event3
//     name:     "fts_ts"
//     events:
//       ABS (0003): ABS_MT_POSITION_X    : value 0, min 0, max 1079, fuzz 0, flat 0, resolution 0
//                   ABS_MT_POSITION_Y    : value 0, min 0, max 2339, fuzz 0, flat 0, resolution 0
//
// Raw touch coordinates are frequently reported in a digitizer-native range
// (e.g. 0-1079) that differs from the device's screen pixel resolution, so
// this range is needed to scale captured touch points to screen coordinates.
export interface AxisRange {
  min: number
  max: number
}

export interface TouchGeometry {
  rangeX: AxisRange
  rangeY: AxisRange
  protocol: 'multitouch' | 'single-touch'
  /**
   * The specific /dev/input/eventN node this geometry came from. Devices
   * commonly expose more than one input node that reports ABS_X/ABS_Y-style
   * codes - e.g. a touchscreen alongside a stylus/pen digitizer channel with
   * its own, unrelated coordinate range - so the live capture stream must be
   * scoped to this exact node, not every input device at once (see
   * createLiveTouchEventSource).
   */
  devicePath: string
}

interface DeviceBlock {
  path: string
  body: string
}

const DEVICE_HEADER_PATTERN = /^add device \d+:\s*(\S+)\s*$/gm

// `getevent -pl` lists every input device in one dump; split it into
// per-device chunks so axis lookups can't cross device boundaries.
function splitDeviceBlocks(output: string): DeviceBlock[] {
  const headers = [...output.matchAll(DEVICE_HEADER_PATTERN)]
  return headers.map((match, i) => {
    const start = match.index + match[0].length
    const end = i + 1 < headers.length ? headers[i + 1].index : output.length
    return { path: match[1], body: output.slice(start, end) }
  })
}

function firstAxisRange(output: string, axisName: string): AxisRange | null {
  const pattern = new RegExp(`${axisName}\\s*:\\s*value\\s+-?\\d+,\\s*min\\s+(-?\\d+),\\s*max\\s+(-?\\d+)`)
  const match = pattern.exec(output)
  if (!match) return null
  return { min: Number.parseInt(match[1], 10), max: Number.parseInt(match[2], 10) }
}

// Prefers a genuine multitouch (Type B) device over a single-touch fallback
// across the WHOLE dump before ever falling back, so a non-touchscreen device
// that happens to also report bare ABS_X/ABS_Y (e.g. a stylus/pen digitizer)
// is never mistaken for the touchscreen when a real one is present.
export function parseTouchGeometry(getEventPlOutput: string): TouchGeometry | null {
  const blocks = splitDeviceBlocks(getEventPlOutput)

  for (const block of blocks) {
    const mtX = firstAxisRange(block.body, 'ABS_MT_POSITION_X')
    const mtY = firstAxisRange(block.body, 'ABS_MT_POSITION_Y')
    if (mtX && mtY) return { rangeX: mtX, rangeY: mtY, protocol: 'multitouch', devicePath: block.path }
  }

  for (const block of blocks) {
    const x = firstAxisRange(block.body, 'ABS_X')
    const y = firstAxisRange(block.body, 'ABS_Y')
    if (x && y) return { rangeX: x, rangeY: y, protocol: 'single-touch', devicePath: block.path }
  }

  return null
}

export type CoordinateScaler = (x: number, y: number) => { x: number; y: number }

export function createCoordinateScaler(
  geometry: TouchGeometry,
  screenWidth: number,
  screenHeight: number,
): CoordinateScaler {
  const spanX = geometry.rangeX.max - geometry.rangeX.min || 1
  const spanY = geometry.rangeY.max - geometry.rangeY.min || 1
  const scaleX = screenWidth / spanX
  const scaleY = screenHeight / spanY

  return (x, y) => ({
    x: Math.round((x - geometry.rangeX.min) * scaleX),
    y: Math.round((y - geometry.rangeY.min) * scaleY),
  })
}

// Used when geometry couldn't be determined - assumes raw coordinates already
// equal screen pixels, which holds on some devices but not all.
export const IDENTITY_SCALER: CoordinateScaler = (x, y) => ({ x, y })
