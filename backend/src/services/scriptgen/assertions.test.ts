import { describe, it, expect } from 'vitest'
import { detectNewlyVisibleText } from './assertions.js'

describe('detectNewlyVisibleText', () => {
  it('detects text that appeared after the action', () => {
    const before = { timestamp: 't0', visibleTexts: ['Log in', 'Username', 'Password'] }
    const after = { timestamp: 't1', visibleTexts: ['Dashboard', 'Welcome back'] }
    expect(detectNewlyVisibleText(before, after)).toEqual(['Welcome back', 'Dashboard'])
  })

  it('returns an empty list when nothing new appeared', () => {
    const state = { timestamp: 't0', visibleTexts: ['Home', 'Settings'] }
    expect(detectNewlyVisibleText(state, { ...state })).toEqual([])
  })

  it('caps the result at 2 assertions, preferring longer/more specific text', () => {
    const before = { timestamp: 't0', visibleTexts: [] }
    const after = { timestamp: 't1', visibleTexts: ['OK', 'Order confirmed', 'Your total is $42.00', 'Done'] }
    const result = detectNewlyVisibleText(before, after)
    expect(result).toHaveLength(2)
    expect(result).toEqual(['Your total is $42.00', 'Order confirmed'])
  })

  it('ignores very short strings (likely noise, not meaningful content)', () => {
    const before = { timestamp: 't0', visibleTexts: [] }
    const after = { timestamp: 't1', visibleTexts: ['•', 'X'] }
    expect(detectNewlyVisibleText(before, after)).toEqual([])
  })

  it('returns an empty list when the "after" state has no visible text info', () => {
    expect(detectNewlyVisibleText({ timestamp: 't0' }, { timestamp: 't1' })).toEqual([])
  })

  it('treats a missing "before" state as an empty baseline', () => {
    const after = { timestamp: 't1', visibleTexts: ['Dashboard'] }
    expect(detectNewlyVisibleText(undefined, after)).toEqual(['Dashboard'])
  })
})
