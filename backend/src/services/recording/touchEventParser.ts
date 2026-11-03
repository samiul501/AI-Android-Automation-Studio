// Parses the output of `adb shell getevent -lt <device>`, e.g.:
//   [   68143.052987] /dev/input/event3: EV_ABS       ABS_MT_TRACKING_ID   00000001
//   [   68143.052987] /dev/input/event3: EV_ABS       ABS_MT_POSITION_X    00000230
//   [   68143.052987] /dev/input/event3: EV_KEY       BTN_TOUCH            DOWN
//   [   68143.052987] /dev/input/event3: EV_SYN       SYN_REPORT           00000000
//
// This is the standard Linux evdev / Android toolbox `getevent` text format,
// present on essentially every Android device - not something specific to any
// one phone model.
export interface InputEvent {
  timestampSec: number
  device: string
  type: 'EV_ABS' | 'EV_KEY' | 'EV_SYN' | 'EV_REL' | string
  code: string
  rawValue: string
  /** Numeric interpretation of rawValue: hex-decoded for EV_ABS/EV_REL, 1/0 for DOWN/UP. */
  value: number
}

const LINE_PATTERN = /^\[\s*(\d+\.\d+)\s*\]\s*(\S+):\s*(\S+)\s+(\S+)\s+(\S+)\s*$/

function decodeValue(rawValue: string): number {
  if (rawValue === 'DOWN') return 1
  if (rawValue === 'UP') return 0
  // EV_ABS/EV_REL values are printed as zero-padded hex; EV_KEY can also report
  // a hex repeat-count instead of DOWN/UP on some devices.
  const parsed = Number.parseInt(rawValue, 16)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function parseGeteventLine(line: string): InputEvent | null {
  const match = LINE_PATTERN.exec(line.trim())
  if (!match) return null

  const [, timestamp, device, type, code, rawValue] = match
  return {
    timestampSec: Number.parseFloat(timestamp),
    device,
    type,
    code,
    rawValue,
    value: decodeValue(rawValue),
  }
}

// ABS_MT_TRACKING_ID reports -1 (0xffffffff) to signal a contact lifted.
// `getevent` prints it unsigned, so it decodes to 4294967295.
export const TRACKING_ID_RELEASED = 0xffffffff
