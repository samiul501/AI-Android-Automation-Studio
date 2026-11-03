// Every strategy here maps 1:1 to a real Mobilewright locator factory
// (getByTestId, getByLabel, getByRole, getByText, getByPlaceholder, getByType),
// in priority order - test ID first, raw coordinates only as a last resort.
export type LocatorStrategy =
  'testId' | 'label' | 'role' | 'text' | 'placeholder' | 'attribute' | 'xpath' | 'coordinates'

export interface LocatorCandidate {
  strategy: LocatorStrategy
  /** Ready-to-use Mobilewright expression, e.g. "getByRole('button', { name: 'Login' })". */
  expression: string
  /** 0-100. Penalized when the same signal matches more than one element on screen. */
  confidence: number
  unique: boolean
  matchCount: number
  reason: string
}

export interface LocatorSuggestion {
  best: LocatorCandidate
  alternatives: LocatorCandidate[]
}
