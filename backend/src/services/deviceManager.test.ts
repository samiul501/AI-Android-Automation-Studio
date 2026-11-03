import { describe, it, expect } from 'vitest'
import { parseDevicesOutput, parseGetprop } from './deviceManager.js'

describe('parseDevicesOutput', () => {
  it('returns an empty list when no devices are attached', () => {
    expect(parseDevicesOutput('List of devices attached\n\n')).toEqual([])
  })

  it('parses a connected authorized device', () => {
    const output = 'List of devices attached\nR58M12ABCDE            device usb:1-1 model:SM_G973N transport_id:1\n'
    expect(parseDevicesOutput(output)).toEqual([{ serial: 'R58M12ABCDE', state: 'device' }])
  })

  it('parses an unauthorized device', () => {
    const output = 'List of devices attached\nABCD1234                unauthorized usb:1-2 transport_id:2\n'
    expect(parseDevicesOutput(output)).toEqual([{ serial: 'ABCD1234', state: 'unauthorized' }])
  })

  it('parses multiple devices', () => {
    const output = [
      'List of devices attached',
      'R58M12ABCDE            device usb:1-1 transport_id:1',
      'emulator-5554          offline',
      '',
    ].join('\n')
    expect(parseDevicesOutput(output)).toEqual([
      { serial: 'R58M12ABCDE', state: 'device' },
      { serial: 'emulator-5554', state: 'offline' },
    ])
  })
})

describe('parseGetprop', () => {
  it('extracts only the requested keys', () => {
    const output = [
      '[ro.product.model]: [SM_G973N]',
      '[ro.build.version.release]: [11]',
      '[ro.other.prop]: [ignored]',
    ].join('\n')
    expect(parseGetprop(output, ['ro.product.model', 'ro.build.version.release'])).toEqual({
      'ro.product.model': 'SM_G973N',
      'ro.build.version.release': '11',
    })
  })

  it('returns an empty object when nothing matches', () => {
    expect(parseGetprop('[ro.other.prop]: [value]', ['ro.product.model'])).toEqual({})
  })
})
