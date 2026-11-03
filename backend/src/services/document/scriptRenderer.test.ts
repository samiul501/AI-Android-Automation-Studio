import { describe, it, expect } from 'vitest'
import { renderTestCase } from './scriptRenderer.js'
import type { TestCase } from './types.js'

function makeTestCase(steps: TestCase['steps']): TestCase {
  return {
    id: 't1',
    title: 'Log in with valid credentials',
    description: '',
    priority: 'medium',
    steps,
    approved: true,
  }
}

describe('renderTestCase', () => {
  it('renders a tap step with a valid locator', () => {
    const script = renderTestCase(
      makeTestCase([{ title: 'Tap login button', action: 'tap', locatorExpression: "getByText('Log In')" }]),
      'typescript',
    )
    expect(script.code).toContain("await screen.getByText('Log In').tap();")
    expect(script.fileName).toBe('log-in-with-valid-credentials.test.ts')
  })

  it('falls back to a TODO comment when no locator is present', () => {
    const script = renderTestCase(makeTestCase([{ title: 'Tap something', action: 'tap' }]), 'typescript')
    expect(script.code).toContain('// TODO: tap')
  })

  it('rejects a locator expression that does not match the safe pattern', () => {
    const script = renderTestCase(
      makeTestCase([
        { title: 'Tap suspicious', action: 'tap', locatorExpression: "getByText('x')); process.exit(1); //" },
      ]),
      'typescript',
    )
    expect(script.code).not.toContain('process.exit')
    expect(script.code).toContain('// TODO: tap')
  })

  it('routes a sensitive fill through an env var instead of a literal', () => {
    const script = renderTestCase(
      makeTestCase([
        {
          title: 'Enter password',
          action: 'fill',
          locatorExpression: "getByLabel('Password')",
          value: 'hunter2',
          isSensitive: true,
        },
      ]),
      'typescript',
    )
    expect(script.code).toContain('process.env.TEST_ENTER_PASSWORD')
    expect(script.code).not.toContain('hunter2')
    expect(script.requiredEnvVars).toEqual(['TEST_ENTER_PASSWORD'])
  })

  it('writes an ordinary fill value as a literal', () => {
    const script = renderTestCase(
      makeTestCase([
        { title: 'Search', action: 'fill', locatorExpression: "getByPlaceholder('Search')", value: 'pizza' },
      ]),
      'typescript',
    )
    expect(script.code).toContain('fill("pizza")')
  })

  it('renders assertVisible with a locator when present, falling back to getByText with the value', () => {
    const withLocator = renderTestCase(
      makeTestCase([{ title: 'Verify welcome', action: 'assertVisible', locatorExpression: "getByTestId('welcome')" }]),
      'typescript',
    )
    expect(withLocator.code).toContain("expect(screen.getByTestId('welcome')).toBeVisible();")

    const withoutLocator = renderTestCase(
      makeTestCase([{ title: 'Verify text', action: 'assertVisible', value: 'Welcome back' }]),
      'typescript',
    )
    expect(withoutLocator.code).toContain('expect(screen.getByText("Welcome back")).toBeVisible();')
  })

  it('renders back as a hardware button press', () => {
    const script = renderTestCase(makeTestCase([{ title: 'Go back', action: 'back' }]), 'typescript')
    expect(script.code).toContain("await screen.pressButton('BACK');")
  })

  it('uses a .js extension for javascript output', () => {
    const script = renderTestCase(makeTestCase([{ title: 'Go back', action: 'back' }]), 'javascript')
    expect(script.fileName).toBe('log-in-with-valid-credentials.test.js')
  })

  it('emits a placeholder comment when a test case has no steps', () => {
    const script = renderTestCase(makeTestCase([]), 'typescript')
    expect(script.code).toContain('No steps were defined')
  })
})
