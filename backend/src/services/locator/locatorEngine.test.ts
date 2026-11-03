import { describe, it, expect } from 'vitest'
import { rankLocators } from './locatorEngine.js'
import { extractElementInfo, findElementAtPoint } from '../recording/uiTree.js'
import type { RawUiNode } from '../recording/types.js'

const LOGIN_SCREEN: RawUiNode = {
  bounds: { x: 0, y: 0, width: 1080, height: 2340 },
  children: [
    {
      bounds: { x: 40, y: 400, width: 300, height: 60 },
      'resource-id': 'com.example:id/username',
      class: 'android.widget.EditText',
      hint: 'Username',
    },
    {
      bounds: { x: 40, y: 480, width: 300, height: 60 },
      'resource-id': 'com.example:id/password',
      class: 'android.widget.EditText',
      hint: 'Password',
    },
    {
      bounds: { x: 400, y: 2000, width: 200, height: 80 },
      'resource-id': 'com.example:id/login',
      class: 'android.widget.Button',
      text: 'Log in',
      'content-desc': 'Log in button',
    },
    { bounds: { x: 0, y: 100, width: 1080, height: 60 }, class: 'android.widget.TextView', text: 'Welcome' },
    { bounds: { x: 0, y: 2200, width: 1080, height: 60 }, class: 'android.widget.TextView', text: 'Welcome' },
  ],
}

describe('rankLocators', () => {
  it('prefers getByTestId when a resource-id is present and unique', () => {
    const node = findElementAtPoint(LOGIN_SCREEN, 500, 2020)!
    const suggestion = rankLocators({
      element: extractElementInfo(node),
      tree: LOGIN_SCREEN,
      node,
      point: { x: 500, y: 2020 },
    })
    expect(suggestion.best.strategy).toBe('testId')
    expect(suggestion.best.expression).toBe("getByTestId('com.example:id/login')")
    expect(suggestion.best.unique).toBe(true)
    expect(suggestion.best.confidence).toBeGreaterThan(90)
  })

  it('offers getByRole and getByText as lower-ranked alternatives to a unique testId', () => {
    const node = findElementAtPoint(LOGIN_SCREEN, 500, 2020)!
    const suggestion = rankLocators({
      element: extractElementInfo(node),
      tree: LOGIN_SCREEN,
      node,
      point: { x: 500, y: 2020 },
    })
    const strategies = suggestion.alternatives.map((c) => c.strategy)
    expect(strategies).toContain('role')
    expect(strategies).toContain('label')
    expect(strategies).toContain('text')
    const role = suggestion.alternatives.find((c) => c.strategy === 'role')!
    expect(role.expression).toBe("getByRole('button', { name: 'Log in button' })")
  })

  it('always includes coordinates as the lowest-confidence fallback', () => {
    const node = findElementAtPoint(LOGIN_SCREEN, 500, 2020)!
    const suggestion = rankLocators({
      element: extractElementInfo(node),
      tree: LOGIN_SCREEN,
      node,
      point: { x: 500, y: 2020 },
    })
    const all = [suggestion.best, ...suggestion.alternatives]
    const coords = all.find((c) => c.strategy === 'coordinates')!
    expect(coords.expression).toBe('tap(500, 2020)')
    expect(coords.confidence).toBe(Math.min(...all.map((c) => c.confidence)))
  })

  it('penalizes every candidate when the same text appears twice on screen (two "Welcome" labels)', () => {
    const node = findElementAtPoint(LOGIN_SCREEN, 500, 130)!
    const suggestion = rankLocators({
      element: extractElementInfo(node),
      tree: LOGIN_SCREEN,
      node,
      point: { x: 500, y: 130 },
    })
    // TextView also maps to the "text" role, so both the role and text
    // candidates see the same duplicate and get penalized the same way.
    expect(suggestion.best.unique).toBe(false)
    expect(suggestion.best.matchCount).toBe(2)
    expect(suggestion.best.confidence).toBeLessThan(65)
    const textCandidate = [suggestion.best, ...suggestion.alternatives].find((c) => c.strategy === 'text')!
    expect(textCandidate.unique).toBe(false)
    expect(textCandidate.matchCount).toBe(2)
  })

  it('uses the placeholder (hint) for an EditText with no text or label', () => {
    const node = findElementAtPoint(LOGIN_SCREEN, 100, 420)!
    const suggestion = rankLocators({
      element: extractElementInfo(node),
      tree: LOGIN_SCREEN,
      node,
      point: { x: 100, y: 420 },
    })
    // resource-id is present and unique, so it still wins over placeholder.
    expect(suggestion.best.strategy).toBe('testId')
    const placeholder = suggestion.alternatives.find((c) => c.strategy === 'placeholder')
    expect(placeholder?.expression).toBe("getByPlaceholder('Username')")
  })

  it('falls back to coordinates only when there is no element info at all', () => {
    const suggestion = rankLocators({ element: undefined, tree: undefined, node: undefined, point: { x: 12, y: 34 } })
    expect(suggestion.best.strategy).toBe('coordinates')
    expect(suggestion.alternatives).toEqual([])
  })

  it('escapes single quotes in accessibility text so the generated expression is valid', () => {
    const tree: RawUiNode = { bounds: { x: 0, y: 0, width: 100, height: 100 }, text: "It's here" }
    const suggestion = rankLocators({ element: extractElementInfo(tree), tree, node: tree, point: { x: 10, y: 10 } })
    expect(suggestion.best.expression).toBe("getByText('It\\'s here')")
  })
})
