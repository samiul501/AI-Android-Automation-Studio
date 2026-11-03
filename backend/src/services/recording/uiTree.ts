import type { Bounds, ElementInfo, RawUiNode } from './types.js'

// `mobilecli dump ui` is the only source of accessibility info we have, and
// its exact field naming isn't part of a contract we can rely on (see the
// Phase 3 notes on driver-mobilecli's own field mapping). Every accessor here
// checks a handful of likely aliases rather than assuming one exact shape.
export function readChildren(node: RawUiNode): RawUiNode[] {
  const children = node.children ?? node.child ?? node.subviews
  return Array.isArray(children) ? (children as RawUiNode[]) : []
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readBounds(node: RawUiNode): Bounds | undefined {
  const candidate = node.bounds ?? node.rect ?? node.frame

  if (candidate && typeof candidate === 'object') {
    const c = candidate as Record<string, unknown>
    const x = asFiniteNumber(c.x)
    const y = asFiniteNumber(c.y)
    const width = asFiniteNumber(c.width)
    const height = asFiniteNumber(c.height)
    if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
      return { x, y, width, height }
    }

    const left = asFiniteNumber(c.left)
    const top = asFiniteNumber(c.top)
    const right = asFiniteNumber(c.right)
    const bottom = asFiniteNumber(c.bottom)
    if (left !== undefined && top !== undefined && right !== undefined && bottom !== undefined) {
      return { x: left, y: top, width: right - left, height: bottom - top }
    }
  }

  // uiautomator-style "[left,top][right,bottom]" string bounds.
  if (typeof candidate === 'string') {
    const match = /\[(-?\d+),(-?\d+)]\[(-?\d+),(-?\d+)]/.exec(candidate)
    if (match) {
      const [left, top, right, bottom] = match.slice(1).map(Number)
      return { x: left, y: top, width: right - left, height: bottom - top }
    }
  }

  return undefined
}

function firstString(node: RawUiNode, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = node[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

function firstBoolean(node: RawUiNode, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = node[key]
    if (typeof value === 'boolean') return value
  }
  return undefined
}

export function extractElementInfo(node: RawUiNode): ElementInfo {
  return {
    resourceId: firstString(node, ['resourceId', 'resource-id', 'resource_id', 'identifier']),
    text: firstString(node, ['text', 'value']),
    contentDescription: firstString(node, ['contentDescription', 'content-desc', 'label', 'accessibilityLabel']),
    className: firstString(node, ['className', 'class', 'type']),
    bounds: readBounds(node),
    clickable: firstBoolean(node, ['clickable', 'isEnabled', 'enabled']),
    isFocused: firstBoolean(node, ['isFocused', 'focused']),
    raw: node,
  }
}

function containsPoint(bounds: Bounds, x: number, y: number): boolean {
  return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height
}

function area(bounds: Bounds): number {
  return bounds.width * bounds.height
}

// Depth-first hit test: returns the smallest-area node whose bounds contain
// the point, mirroring how a touch resolves to the topmost/innermost visible
// element in a real accessibility tree.
export function findElementAtPoint(root: RawUiNode, x: number, y: number): RawUiNode | undefined {
  const bounds = readBounds(root)
  if (bounds && !containsPoint(bounds, x, y)) return undefined

  let best: RawUiNode | undefined = bounds ? root : undefined
  let bestArea = bounds ? area(bounds) : Number.POSITIVE_INFINITY

  for (const child of readChildren(root)) {
    const match = findElementAtPoint(child, x, y)
    if (!match) continue
    const matchBounds = readBounds(match)
    const matchArea = matchBounds ? area(matchBounds) : Number.POSITIVE_INFINITY
    if (matchArea <= bestArea) {
      best = match
      bestArea = matchArea
    }
  }

  return best
}

function isEditableClassName(className: string | undefined): boolean {
  return className !== undefined && /EditText|TextField|SearchView|AutoCompleteTextView/i.test(className)
}

// Most fields have a resource-id, but plenty of custom search boxes don't -
// falling back to className+bounds keeps those trackable too. Bounds change
// whenever the field itself moves/resizes (e.g. a different screen), so this
// fallback key naturally stops matching once the field is genuinely gone,
// rather than silently latching onto an unrelated field that reused the slot.
export function editableFieldKey(info: ElementInfo): string | undefined {
  if (info.resourceId) return `id:${info.resourceId}`
  if (info.bounds) {
    const { x, y, width, height } = info.bounds
    return `bounds:${info.className ?? ''}:${x},${y},${width},${height}`
  }
  return undefined
}

function collectEditableNodes(root: RawUiNode, out: Map<string, ElementInfo>): void {
  const info = extractElementInfo(root)
  if (isEditableClassName(info.className)) {
    const key = editableFieldKey(info)
    if (key) out.set(key, info)
  }
  for (const child of readChildren(root)) collectEditableNodes(child, out)
}

// Android soft-keyboard keystrokes aren't observable through the app's own
// accessibility tree - only the resulting field value is, and only while
// that field reports itself focused. Finds whichever editable field in the
// tree is currently focused, if any - the caller uses this to track a field
// across an entire typing session rather than diffing per gesture.
export function findFocusedEditableField(tree: RawUiNode | undefined): ElementInfo | undefined {
  if (!tree) return undefined
  const editables = new Map<string, ElementInfo>()
  collectEditableNodes(tree, editables)
  for (const info of editables.values()) {
    if (info.isFocused) return info
  }
  return undefined
}

// Used for smart assertion generation: comparing the visible-text sets of two
// snapshots reveals what content newly appeared as a result of an action.
export function collectVisibleTexts(tree: RawUiNode): string[] {
  const seen = new Set<string>()
  const walk = (node: RawUiNode): void => {
    const text = extractElementInfo(node).text?.trim()
    if (text) seen.add(text)
    for (const child of readChildren(node)) walk(child)
  }
  walk(tree)
  return [...seen]
}
