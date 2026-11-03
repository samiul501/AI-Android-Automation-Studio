import type { ScreenState } from '../recording/types.js'

const MAX_ASSERTIONS_PER_ACTION = 2
const MIN_TEXT_LENGTH = 2

// Compares the visible-text sets captured just before and just after an
// action to find content that clearly appeared *because of* that action -
// this is what turns "tap Login" into "tap Login" + "expect Dashboard text
// to be visible", instead of just replaying the recorded gestures verbatim.
export function detectNewlyVisibleText(before: ScreenState | undefined, after: ScreenState | undefined): string[] {
  if (!after?.visibleTexts?.length) return []

  const beforeSet = new Set(before?.visibleTexts ?? [])
  const newTexts = after.visibleTexts.filter((text) => text.length >= MIN_TEXT_LENGTH && !beforeSet.has(text))

  // Longer, more specific strings make more distinctive (less flaky) assertions
  // than short generic labels, so they're preferred when several appeared at once.
  return newTexts.sort((a, b) => b.length - a.length).slice(0, MAX_ASSERTIONS_PER_ACTION)
}
