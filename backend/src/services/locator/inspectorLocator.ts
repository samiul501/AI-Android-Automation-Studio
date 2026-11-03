import type { ElementInfo } from '../recording/types.js'
import { INSPECTOR_LOCATORS_KEY, type InspectorLocatorSummary } from '../recording/liveCapture.js'
import type { LocatorCandidate, LocatorStrategy, LocatorSuggestion } from './types.js'

const KIND_TO_STRATEGY: Record<string, LocatorStrategy> = {
  testId: 'testId',
  role: 'role',
  label: 'label',
  text: 'text',
}

// Mirrors locatorEngine.ts's own priority order for the strategies the two
// engines share. The Inspector already verified each locator it hands back
// is unique on screen, so unlike locatorEngine.ts's own scoring there's no
// match-count penalty to compute here.
const BASE_CONFIDENCE: Record<string, number> = {
  testId: 95,
  label: 85,
  role: 75,
  text: 65,
}

function escapeForExpression(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

// Mirrors the Inspector's own reference frontend's locator-label formatting
// (see LiveInspectorView.tsx's formatLocator), so a recorded action's
// expression reads exactly like what a user already saw in the Inspector.
function toExpression(locator: InspectorLocatorSummary): string {
  const value = escapeForExpression(locator.value)
  switch (locator.kind) {
    case 'testId':
      return `getByTestId('${value}')`
    case 'role': {
      const name = locator.name ? escapeForExpression(locator.name) : undefined
      return name ? `getByRole('${value}', { name: '${name}' })` : `getByRole('${value}')`
    }
    case 'label':
      return `getByLabel('${value}')`
    case 'text':
      return `getByText('${value}')`
    default:
      return `getByTestId('${value}')`
  }
}

function toCandidate(locator: InspectorLocatorSummary): LocatorCandidate | undefined {
  const strategy = KIND_TO_STRATEGY[locator.kind]
  if (!strategy) return undefined
  return {
    strategy,
    expression: toExpression(locator),
    confidence: BASE_CONFIDENCE[locator.kind] ?? 50,
    unique: true,
    matchCount: 1,
    reason: 'derived by the Mobilewright Inspector, which already verified this locator is unique on screen',
  }
}

// Reads the Inspector-derived locator list that liveCapture.ts's
// elementsToRawTree stashes on each synthetic node, when the recording
// session's snapshot came from the Inspector (see manager.ts). Returns
// undefined when it didn't - e.g. tests exercising RecordingSession with a
// hand-built RawUiNode - so callers fall back to the tree-based
// locatorEngine.ts instead.
export function inspectorLocatorSuggestion(
  element: ElementInfo | undefined,
  point: { x: number; y: number },
): LocatorSuggestion | undefined {
  const locators = element?.raw?.[INSPECTOR_LOCATORS_KEY]
  if (!Array.isArray(locators) || locators.length === 0) return undefined

  const candidates = (locators as InspectorLocatorSummary[])
    .map(toCandidate)
    .filter((c): c is LocatorCandidate => c !== undefined)
  if (candidates.length === 0) return undefined

  candidates.push({
    strategy: 'coordinates',
    expression: `tap(${Math.round(point.x)}, ${Math.round(point.y)})`,
    confidence: 5,
    unique: true,
    matchCount: 1,
    reason: 'raw coordinates - avoid unless every other option is unusable',
  })

  candidates.sort((a, b) => b.confidence - a.confidence)
  const [best, ...alternatives] = candidates
  return { best, alternatives }
}
