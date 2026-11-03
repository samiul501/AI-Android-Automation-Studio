import { describe, it, expect } from 'vitest'
import { selectRequiredChecks, isReady, type DoctorCheck } from './mobilewrightDoctor.js'

function makeCheck(id: string, status: DoctorCheck['status']): DoctorCheck {
  return { id, name: id, category: 'system', status, version: null, path: null, details: null, fix: null }
}

describe('selectRequiredChecks', () => {
  it('keeps only mobilecli and adb, ignoring android-studio/emulator checks', () => {
    const checks = [
      makeCheck('mobilecli', 'ok'),
      makeCheck('adb', 'ok'),
      makeCheck('android_home', 'error'),
      makeCheck('android_emulator', 'warning'),
    ]
    expect(selectRequiredChecks(checks).map((c) => c.id)).toEqual(['mobilecli', 'adb'])
  })
})

describe('isReady', () => {
  it('is ready when both required checks are ok', () => {
    expect(isReady([makeCheck('mobilecli', 'ok'), makeCheck('adb', 'ok')])).toBe(true)
  })

  it('is not ready when a required check has a warning', () => {
    expect(isReady([makeCheck('mobilecli', 'warning'), makeCheck('adb', 'ok')])).toBe(false)
  })

  it('is not ready when a required check is missing entirely', () => {
    expect(isReady([makeCheck('adb', 'ok')])).toBe(false)
  })

  it('is not ready when no checks are present', () => {
    expect(isReady([])).toBe(false)
  })
})
