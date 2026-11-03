import { describe, it, expect } from 'vitest'
import { parseGeteventLine, TRACKING_ID_RELEASED } from './touchEventParser.js'

describe('parseGeteventLine', () => {
  it('parses an EV_ABS position line with a hex value', () => {
    const line = '[   68143.052987] /dev/input/event3: EV_ABS       ABS_MT_POSITION_X    00000230'
    expect(parseGeteventLine(line)).toEqual({
      timestampSec: 68143.052987,
      device: '/dev/input/event3',
      type: 'EV_ABS',
      code: 'ABS_MT_POSITION_X',
      rawValue: '00000230',
      value: 0x230,
    })
  })

  it('decodes ABS_MT_TRACKING_ID release (0xffffffff) correctly', () => {
    const line = '[   68143.523112] /dev/input/event3: EV_ABS       ABS_MT_TRACKING_ID   ffffffff'
    const parsed = parseGeteventLine(line)
    expect(parsed?.value).toBe(TRACKING_ID_RELEASED)
  })

  it('decodes EV_KEY DOWN/UP as 1/0', () => {
    const down = parseGeteventLine('[   1.000000] /dev/input/event3: EV_KEY       BTN_TOUCH            DOWN')
    const up = parseGeteventLine('[   1.500000] /dev/input/event3: EV_KEY       BTN_TOUCH            UP')
    expect(down?.value).toBe(1)
    expect(up?.value).toBe(0)
  })

  it('parses SYN_REPORT lines', () => {
    const line = '[   68143.052987] /dev/input/event3: EV_SYN       SYN_REPORT           00000000'
    const parsed = parseGeteventLine(line)
    expect(parsed?.type).toBe('EV_SYN')
    expect(parsed?.code).toBe('SYN_REPORT')
  })

  it('returns null for unrecognized lines (e.g. device add/remove banners)', () => {
    expect(parseGeteventLine('add device 1: /dev/input/event3')).toBeNull()
    expect(parseGeteventLine('')).toBeNull()
  })
})
