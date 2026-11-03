import { describe, it, expect } from 'vitest'
import { buildUserMessage } from './prompt.js'

describe('buildUserMessage', () => {
  it('includes the script name, error, and script source', () => {
    const message = buildUserMessage({
      scriptFileName: 'login-flow.test.ts',
      scriptCode: "test('login', async () => {});",
      errorMessage: 'Timed out waiting for element',
    })
    expect(message).toContain('Script: login-flow.test.ts')
    expect(message).toContain('Error: Timed out waiting for element')
    expect(message).toContain("test('login', async () => {});")
  })

  it('includes the failed step title when present', () => {
    const message = buildUserMessage({
      scriptFileName: 'a.test.ts',
      scriptCode: 'x',
      errorMessage: 'boom',
      failedStepTitle: 'Tap "Log in"',
    })
    expect(message).toContain('Failed step: Tap "Log in"')
  })

  it('omits the failed step line when not provided', () => {
    const message = buildUserMessage({ scriptFileName: 'a.test.ts', scriptCode: 'x', errorMessage: 'boom' })
    expect(message).not.toContain('Failed step:')
  })

  it('formats device info compactly', () => {
    const message = buildUserMessage({
      scriptFileName: 'a.test.ts',
      scriptCode: 'x',
      errorMessage: 'boom',
      deviceInfo: { model: 'Pixel 8', androidVersion: '15', apiLevel: 35 },
    })
    expect(message).toContain('Device: Pixel 8, Android 15, API 35')
  })

  it('omits the device line entirely when no device info is given', () => {
    const message = buildUserMessage({ scriptFileName: 'a.test.ts', scriptCode: 'x', errorMessage: 'boom' })
    expect(message).not.toContain('Device:')
  })

  it('caps recent logs to the last 50 lines', () => {
    const logs = Array.from({ length: 100 }, (_, i) => `line ${i}`)
    const message = buildUserMessage({
      scriptFileName: 'a.test.ts',
      scriptCode: 'x',
      errorMessage: 'boom',
      recentLogs: logs,
    })
    expect(message).toContain('line 99')
    expect(message).not.toContain('line 49\n')
  })

  it('omits the logs section when no logs are given', () => {
    const message = buildUserMessage({
      scriptFileName: 'a.test.ts',
      scriptCode: 'x',
      errorMessage: 'boom',
      recentLogs: [],
    })
    expect(message).not.toContain('Recent logs:')
  })
})
