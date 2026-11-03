import { describe, it, expect } from 'vitest'
import { generateScript } from './generator.js'
import type { RecordedAction, RecordingSession } from '../recording/types.js'

function action(partial: Partial<RecordedAction>): RecordedAction {
  return { id: 'a1', timestamp: '2026-01-01T00:00:00.000Z', type: 'tap', ...partial }
}

function session(actions: RecordedAction[], overrides: Partial<RecordingSession> = {}): RecordingSession {
  return {
    id: 'session-1',
    deviceSerial: 'ABC123',
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'stopped',
    actions,
    ...overrides,
  }
}

describe('generateScript', () => {
  it('generates a tap using the best locator expression', () => {
    const result = generateScript(
      session([
        action({
          type: 'tap',
          locator: {
            best: {
              strategy: 'testId',
              expression: "getByTestId('login')",
              confidence: 95,
              unique: true,
              matchCount: 1,
              reason: 'x',
            },
            alternatives: [],
          },
        }),
      ]),
      { language: 'typescript' },
    )
    expect(result.code).toContain("await screen.getByTestId('login').tap();")
    expect(result.fileName.endsWith('.test.ts')).toBe(true)
  })

  it('uses .test.js for javascript output with identical code', () => {
    const testAction = action({
      type: 'tap',
      locator: {
        best: {
          strategy: 'testId',
          expression: "getByTestId('login')",
          confidence: 95,
          unique: true,
          matchCount: 1,
          reason: 'x',
        },
        alternatives: [],
      },
    })
    const ts = generateScript(session([testAction]), { language: 'typescript' })
    const js = generateScript(session([testAction]), { language: 'javascript' })
    expect(js.fileName.endsWith('.test.js')).toBe(true)
    expect(js.code).toBe(ts.code)
  })

  it('routes a sensitive field through an env var instead of hardcoding the value', () => {
    const result = generateScript(
      session([
        action({
          type: 'text_input',
          text: 'hunter2',
          element: { resourceId: 'com.example:id/password' },
          locator: {
            best: {
              strategy: 'testId',
              expression: "getByTestId('com.example:id/password')",
              confidence: 95,
              unique: true,
              matchCount: 1,
              reason: 'x',
            },
            alternatives: [],
          },
        }),
      ]),
      { language: 'typescript' },
    )
    expect(result.code).toContain('process.env.TEST_PASSWORD')
    expect(result.code).not.toContain('hunter2')
    expect(result.requiredEnvVars).toEqual(['TEST_PASSWORD'])
  })

  it('hardcodes an ordinary (non-sensitive) text value directly', () => {
    const result = generateScript(
      session([
        action({
          type: 'text_input',
          text: 'running shoes',
          element: { resourceId: 'com.example:id/search' },
          locator: {
            best: {
              strategy: 'testId',
              expression: "getByTestId('com.example:id/search')",
              confidence: 95,
              unique: true,
              matchCount: 1,
              reason: 'x',
            },
            alternatives: [],
          },
        }),
      ]),
      { language: 'typescript' },
    )
    expect(result.code).toContain('"running shoes"')
    expect(result.requiredEnvVars).toEqual([])
  })

  it('generates a getByText assertion when new content appears after an action', () => {
    const result = generateScript(
      session([
        action({
          type: 'tap',
          locator: {
            best: {
              strategy: 'role',
              expression: "getByRole('button', { name: 'Log in' })",
              confidence: 75,
              unique: true,
              matchCount: 1,
              reason: 'x',
            },
            alternatives: [],
          },
          screenBefore: { timestamp: 't0', visibleTexts: ['Log in'] },
          screenAfter: { timestamp: 't1', visibleTexts: ['Dashboard'] },
        }),
      ]),
      { language: 'typescript' },
    )
    expect(result.code).toContain('await expect(screen.getByText("Dashboard")).toBeVisible();')
  })

  it('emits screen.pressButton("BACK") for a back action, with no locator needed', () => {
    const result = generateScript(session([action({ type: 'back' })]), { language: 'typescript' })
    expect(result.code).toContain("await screen.pressButton('BACK');")
  })

  it('swipes on the target element when a stable (non-coordinate) locator was found', () => {
    const result = generateScript(
      session([
        action({
          type: 'scroll',
          direction: 'up',
          locator: {
            best: {
              strategy: 'testId',
              expression: "getByTestId('product-list')",
              confidence: 95,
              unique: true,
              matchCount: 1,
              reason: 'x',
            },
            alternatives: [],
          },
        }),
      ]),
      { language: 'typescript' },
    )
    expect(result.code).toContain("await screen.getByTestId('product-list').swipe({ direction: 'up' });")
  })

  it('taps raw coordinates directly (not chained off a Locator) when only coordinates were found', () => {
    const result = generateScript(
      session([
        action({
          type: 'tap',
          x: 500,
          y: 900,
          locator: {
            best: { strategy: 'coordinates', expression: 'tap(500, 900)', confidence: 5, unique: true, matchCount: 1, reason: 'x' },
            alternatives: [],
          },
        }),
      ]),
      { language: 'typescript' },
    )
    expect(result.code).toContain('await screen.tap(500, 900);')
    expect(result.code).not.toContain('.tap().tap()')
  })

  it('long-presses and double-taps raw coordinates directly when only coordinates were found', () => {
    const coordLocator = {
      best: { strategy: 'coordinates' as const, expression: 'tap(10, 20)', confidence: 5, unique: true, matchCount: 1, reason: 'x' },
      alternatives: [],
    }
    const longPress = generateScript(
      session([action({ type: 'long_press', x: 10, y: 20, locator: coordLocator })]),
      { language: 'typescript' },
    )
    expect(longPress.code).toContain('await screen.longPress(10, 20);')

    const doubleTap = generateScript(
      session([action({ type: 'double_tap', x: 10, y: 20, locator: coordLocator })]),
      { language: 'typescript' },
    )
    expect(doubleTap.code).toContain('await screen.doubleTap(10, 20);')
  })

  it('leaves a TODO for text_input/clear_input when only coordinates were found, since fill/clear need a resolvable locator', () => {
    const coordLocator = {
      best: { strategy: 'coordinates' as const, expression: 'tap(10, 20)', confidence: 5, unique: true, matchCount: 1, reason: 'x' },
      alternatives: [],
    }
    const fill = generateScript(
      session([action({ type: 'text_input', text: 'hello', x: 10, y: 20, locator: coordLocator })]),
      { language: 'typescript' },
    )
    expect(fill.code).toContain('// TODO: enter text')
    expect(fill.code).not.toContain('screen.tap(10, 20).fill')

    const clear = generateScript(session([action({ type: 'clear_input', x: 10, y: 20, locator: coordLocator })]), {
      language: 'typescript',
    })
    expect(clear.code).toContain('// TODO: clear field')
    expect(clear.code).not.toContain('screen.tap(10, 20).clear')
  })

  it('falls back to a global swipe when only a coordinates locator was found', () => {
    const result = generateScript(
      session([
        action({
          type: 'swipe',
          direction: 'left',
          locator: {
            best: {
              strategy: 'coordinates',
              expression: 'tap(500, 900)',
              confidence: 5,
              unique: true,
              matchCount: 1,
              reason: 'x',
            },
            alternatives: [],
          },
        }),
      ]),
      { language: 'typescript' },
    )
    expect(result.code).toContain("await screen.swipe('left');")
  })

  it('detects the app package from a foreground-app snapshot and sets bundleId', () => {
    const result = generateScript(
      session([
        action({ type: 'tap', screenBefore: { timestamp: 't0', foregroundApp: 'com.example.app/.MainActivity' } }),
      ]),
      { language: 'typescript' },
    )
    expect(result.code).toContain("test.use({ bundleId: 'com.example.app' });")
  })

  it('leaves a clear TODO placeholder when the app package could not be detected', () => {
    const result = generateScript(session([action({ type: 'tap' })]), { language: 'typescript' })
    expect(result.code).toContain('REPLACE_WITH_YOUR_APP_PACKAGE')
  })

  it('slugifies the test name into the file name', () => {
    const result = generateScript(session([action({ type: 'tap' })]), {
      language: 'typescript',
      testName: 'Login flow: happy path!',
    })
    expect(result.fileName).toBe('login-flow-happy-path.test.ts')
  })

  it('handles an empty action list without crashing', () => {
    const result = generateScript(session([]), { language: 'typescript' })
    expect(result.code).toContain('No actions were recorded')
  })

  it('wraps every action in a named test.step() so live execution can report per-step progress', () => {
    const result = generateScript(
      session([
        action({
          type: 'tap',
          element: { text: 'Log in' },
          locator: {
            best: {
              strategy: 'testId',
              expression: "getByTestId('login')",
              confidence: 95,
              unique: true,
              matchCount: 1,
              reason: 'x',
            },
            alternatives: [],
          },
        }),
      ]),
      { language: 'typescript' },
    )
    expect(result.code).toContain('await test.step("Tap \\"Log in\\"", async () => {')
    expect(result.code).toContain("await screen.getByTestId('login').tap();")
  })

  it('wraps a generated assertion in its own test.step(), separate from the triggering action', () => {
    const result = generateScript(
      session([
        action({
          type: 'tap',
          locator: {
            best: {
              strategy: 'role',
              expression: "getByRole('button', { name: 'Log in' })",
              confidence: 75,
              unique: true,
              matchCount: 1,
              reason: 'x',
            },
            alternatives: [],
          },
          screenBefore: { timestamp: 't0', visibleTexts: [] },
          screenAfter: { timestamp: 't1', visibleTexts: ['Dashboard'] },
        }),
      ]),
      { language: 'typescript' },
    )
    expect(result.code).toContain('await test.step("Verify \\"Dashboard\\" is visible", async () => {')
  })
})
