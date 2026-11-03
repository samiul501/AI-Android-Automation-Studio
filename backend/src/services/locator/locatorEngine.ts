import type { RawUiNode, ElementInfo } from '../recording/types.js'
import { readChildren, extractElementInfo } from '../recording/uiTree.js'
import { classNameToRole } from './roleMap.js'
import type { LocatorCandidate, LocatorStrategy, LocatorSuggestion } from './types.js'

const BASE_CONFIDENCE: Record<LocatorStrategy, number> = {
  testId: 95,
  label: 85,
  role: 75,
  text: 65,
  placeholder: 55,
  attribute: 40,
  xpath: 25,
  coordinates: 5,
}

function escapeForExpression(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function countMatches(tree: RawUiNode, predicate: (info: ElementInfo) => boolean): number {
  let count = 0
  const walk = (node: RawUiNode): void => {
    if (predicate(extractElementInfo(node))) count++
    for (const child of readChildren(node)) walk(child)
  }
  walk(tree)
  return count
}

function scoreCandidate(
  strategy: LocatorStrategy,
  matchCount: number,
  reason: string,
  expression: string,
): LocatorCandidate {
  const base = BASE_CONFIDENCE[strategy]
  const unique = matchCount <= 1
  const confidence = unique ? base : Math.max(10, Math.round(base / matchCount))
  return { strategy, expression, confidence, unique, matchCount, reason }
}

function readPlaceholder(element: ElementInfo): string | undefined {
  // Android's EditText placeholder is conventionally the "hint" attribute.
  const hint = element.raw?.hint
  return typeof hint === 'string' && hint.length > 0 ? hint : undefined
}

// Builds a structural path from the tree root down to `target` (reference
// equality - both must come from the same in-memory snapshot), indexing
// same-type siblings, e.g. //FrameLayout/LinearLayout/EditText[2].
function buildXPath(root: RawUiNode, target: RawUiNode): string | undefined {
  function search(node: RawUiNode, path: string[]): string[] | null {
    if (node === target) return path
    const typeCounts = new Map<string, number>()
    for (const child of readChildren(node)) {
      const tag = extractElementInfo(child).className ?? 'Node'
      const index = (typeCounts.get(tag) ?? 0) + 1
      typeCounts.set(tag, index)
      const result = search(child, [...path, `${tag}[${index}]`])
      if (result) return result
    }
    return null
  }

  const result = search(root, [])
  return result && result.length > 0 ? '//' + result.join('/') : undefined
}

export interface RankLocatorsOptions {
  element?: ElementInfo
  /** The full snapshot the element was found in - used for uniqueness scoring and XPath. */
  tree?: RawUiNode
  /** The node itself within `tree`, for XPath construction (must be === a node inside `tree`). */
  node?: RawUiNode
  point: { x: number; y: number }
}

export function rankLocators({ element, tree, node, point }: RankLocatorsOptions): LocatorSuggestion {
  const candidates: LocatorCandidate[] = []

  if (element?.resourceId) {
    const resourceId = element.resourceId
    const matchCount = tree ? countMatches(tree, (info) => info.resourceId === resourceId) : 1
    candidates.push(
      scoreCandidate(
        'testId',
        matchCount,
        matchCount <= 1
          ? 'resource-id is unique on screen'
          : `resource-id also matches ${matchCount - 1} other element(s)`,
        `getByTestId('${escapeForExpression(resourceId)}')`,
      ),
    )
  }

  if (element?.contentDescription) {
    const label = element.contentDescription
    const matchCount = tree ? countMatches(tree, (info) => info.contentDescription === label) : 1
    candidates.push(
      scoreCandidate(
        'label',
        matchCount,
        matchCount <= 1
          ? 'accessibility label is unique on screen'
          : `label also matches ${matchCount - 1} other element(s)`,
        `getByLabel('${escapeForExpression(label)}')`,
      ),
    )
  }

  const role = classNameToRole(element?.className)
  const accessibleName = element?.contentDescription || element?.text
  if (role && accessibleName) {
    const matchCount = tree
      ? countMatches(
          tree,
          (info) =>
            classNameToRole(info.className) === role && (info.contentDescription || info.text) === accessibleName,
        )
      : 1
    candidates.push(
      scoreCandidate(
        'role',
        matchCount,
        matchCount <= 1
          ? `semantic role "${role}" + accessible name is unique`
          : `role + name also matches ${matchCount - 1} other element(s)`,
        `getByRole('${role}', { name: '${escapeForExpression(accessibleName)}' })`,
      ),
    )
  }

  if (element?.text) {
    const text = element.text
    const matchCount = tree ? countMatches(tree, (info) => info.text === text) : 1
    candidates.push(
      scoreCandidate(
        'text',
        matchCount,
        matchCount <= 1 ? 'visible text is unique on screen' : `text also matches ${matchCount - 1} other element(s)`,
        `getByText('${escapeForExpression(text)}')`,
      ),
    )
  }

  const placeholder = element ? readPlaceholder(element) : undefined
  if (placeholder) {
    const matchCount = tree ? countMatches(tree, (info) => readPlaceholder(info) === placeholder) : 1
    candidates.push(
      scoreCandidate(
        'placeholder',
        matchCount,
        matchCount <= 1
          ? 'placeholder is unique on screen'
          : `placeholder also matches ${matchCount - 1} other element(s)`,
        `getByPlaceholder('${escapeForExpression(placeholder)}')`,
      ),
    )
  }

  if (element?.className) {
    const className = element.className
    const matchCount = tree ? countMatches(tree, (info) => info.className === className) : 1
    candidates.push(
      scoreCandidate(
        'attribute',
        matchCount,
        'only the element type is known - a fragile locator on its own',
        `getByType('${escapeForExpression(className)}')`,
      ),
    )
  }

  // XPath only when nothing accessibility-based was available at all.
  if (candidates.length === 0 && tree && node) {
    const xpath = buildXPath(tree, node)
    if (xpath) {
      candidates.push(
        scoreCandidate(
          'xpath',
          1,
          'no accessibility attributes were available; falls back to a structural path',
          xpath,
        ),
      )
    }
  }

  // Always present as the guaranteed, least-stable fallback.
  candidates.push(
    scoreCandidate(
      'coordinates',
      1,
      candidates.length === 0
        ? 'no accessibility info or structural path was available'
        : 'raw coordinates - avoid unless every other option is unusable',
      `tap(${Math.round(point.x)}, ${Math.round(point.y)})`,
    ),
  )

  candidates.sort((a, b) => b.confidence - a.confidence)
  const [best, ...alternatives] = candidates
  return { best, alternatives }
}
