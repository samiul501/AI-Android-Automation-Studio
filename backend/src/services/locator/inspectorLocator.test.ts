import { describe, it, expect } from 'vitest'
import { inspectorLocatorSuggestion } from './inspectorLocator.js'
import { INSPECTOR_LOCATORS_KEY } from '../recording/liveCapture.js'
import type { ElementInfo } from '../recording/types.js'

function elementWithLocators(locators: Array<{ kind: string; value: string; name?: string }>): ElementInfo {
  return { raw: { [INSPECTOR_LOCATORS_KEY]: locators } }
}

describe('inspectorLocatorSuggestion', () => {
  it('returns undefined when the element carries no Inspector-derived locators', () => {
    expect(inspectorLocatorSuggestion(undefined, { x: 1, y: 2 })).toBeUndefined()
    expect(inspectorLocatorSuggestion({}, { x: 1, y: 2 })).toBeUndefined()
    expect(inspectorLocatorSuggestion(elementWithLocators([]), { x: 1, y: 2 })).toBeUndefined()
  })

  it('picks testId over the other locators the Inspector reported', () => {
    const element = elementWithLocators([
      { kind: 'text', value: 'Log in' },
      { kind: 'testId', value: 'com.example:id/login' },
    ])
    const suggestion = inspectorLocatorSuggestion(element, { x: 10, y: 20 })
    expect(suggestion?.best).toMatchObject({ strategy: 'testId', expression: "getByTestId('com.example:id/login')" })
  })

  it('formats a role locator with its accessible name', () => {
    const element = elementWithLocators([{ kind: 'role', value: 'button', name: 'Submit' }])
    const suggestion = inspectorLocatorSuggestion(element, { x: 10, y: 20 })
    expect(suggestion?.best).toMatchObject({
      strategy: 'role',
      expression: "getByRole('button', { name: 'Submit' })",
    })
  })

  it('always appends a coordinates fallback as the lowest-confidence alternative', () => {
    const element = elementWithLocators([{ kind: 'testId', value: 'com.example:id/login' }])
    const suggestion = inspectorLocatorSuggestion(element, { x: 10, y: 20 })
    expect(suggestion?.alternatives).toContainEqual(
      expect.objectContaining({ strategy: 'coordinates', expression: 'tap(10, 20)' }),
    )
  })
})
