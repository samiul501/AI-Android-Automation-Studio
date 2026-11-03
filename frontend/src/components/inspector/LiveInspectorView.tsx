import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchInspectSnapshot } from '../../api/inspector'
import type { InspectSnapshot, InspectorElement, InspectorLocator } from '../../types/inspector'

const MAX_CONSECUTIVE_ERRORS = 3

// Mirrors @mobilewright/inspector's own reference frontend's locator-label
// formatting, so a locator shown here reads exactly like the code a
// generated script would contain.
function formatLocator(locator: InspectorLocator): string {
  const value = locator.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  switch (locator.kind) {
    case 'testId':
      return `getByTestId('${value}')`
    case 'role': {
      const name = locator.name?.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      return name ? `getByRole('${value}', { name: '${name}' })` : `getByRole('${value}')`
    }
    case 'label':
      return `getByLabel('${value}')`
    case 'text':
      return `getByText('${value}')`
    default:
      return value
  }
}

// A stable identity for an element across separate snapshots. `el.index` is
// only a position within one specific /api/inspect response's derived list -
// with continuous refresh replacing that list every couple of seconds, the
// same index can land on a completely different element in the next
// snapshot. Bounds are always included, not just resourceId: the same
// resourceId is routinely reused across near-identical rows/cards (e.g. a
// "Follow" button repeated once per suggestion card), and without bounds
// those would all collapse onto one key. Keyed this way, selection/hover
// survives a refresh as long as the element itself hasn't actually moved,
// instead of randomly reattaching to whatever now happens to share its old
// index - or, without bounds, to the first same-resourceId sibling.
function elementKey(el: InspectorElement): string {
  const { x, y, width, height } = el.bounds
  return `${el.resourceId ?? el.type}:${x},${y},${width},${height}`
}

function ElementDetails({ element }: { element: InspectorElement }) {
  return (
    <div className="space-y-3 p-4 text-sm">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Element</h3>
        <p className="mt-1 truncate text-slate-200">{element.type}</p>
      </div>

      <div className="space-y-1">
        {element.text && (
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">Text</span>
            <span className="truncate text-slate-300">{element.text}</span>
          </div>
        )}
        {element.label && (
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">Label</span>
            <span className="truncate text-slate-300">{element.label}</span>
          </div>
        )}
        {element.resourceId && (
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">Resource ID</span>
            <span className="truncate font-mono text-[11px] text-slate-300">{element.resourceId}</span>
          </div>
        )}
        {element.placeholder && (
          <div className="flex justify-between gap-2">
            <span className="text-slate-500">Placeholder</span>
            <span className="truncate text-slate-300">{element.placeholder}</span>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Locators</h3>
        {element.locators.length === 0 ? (
          <p className="mt-1 text-slate-600 italic">No locator available — coordinates only</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {element.locators.map((locator, i) => (
              <li
                key={`${locator.kind}-${i}`}
                className={`truncate rounded px-2 py-1 font-mono text-[11px] ${
                  i === 0 ? 'bg-sky-950/60 text-sky-300' : 'text-slate-500'
                }`}
                title={formatLocator(locator)}
              >
                {formatLocator(locator)}
                {i === 0 && <span className="ml-1 text-sky-500">· best</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function LiveInspectorView() {
  const [snapshot, setSnapshot] = useState<InspectSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const tickInFlightRef = useRef(false)
  const consecutiveErrorsRef = useRef(0)

  const refresh = useCallback(async () => {
    if (tickInFlightRef.current) return
    tickInFlightRef.current = true
    setIsLoading(true)
    try {
      const next = await fetchInspectSnapshot()
      setSnapshot(next)
      setError(null)
      consecutiveErrorsRef.current = 0
    } catch (err) {
      consecutiveErrorsRef.current += 1
      setError(err instanceof Error ? err.message : 'Failed to inspect device')
      if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        setAutoRefresh(false)
      }
    } finally {
      setIsLoading(false)
      tickInFlightRef.current = false
    }
  }, [])

  // Refreshes back-to-back - the next snapshot request fires right after
  // the previous one resolves - instead of waiting out a fixed interval on
  // top of however long the device itself took to respond. A real device
  // screenshot+UI-dump round trip (a few seconds) is the actual floor on how
  // "live" this can get in normal operation, so MIN_TICK_MS is invisible
  // there - it only matters when the Inspector is failing instantly on every
  // call (e.g. no device selected), where it's the one thing standing
  // between that and an unthrottled render loop that hangs the tab.
  useEffect(() => {
    if (!autoRefresh) return
    const MIN_TICK_MS = 250
    let cancelled = false
    const loop = async () => {
      while (!cancelled) {
        const startedAt = Date.now()
        await refresh()
        const elapsed = Date.now() - startedAt
        if (elapsed < MIN_TICK_MS) {
          await new Promise((resolve) => setTimeout(resolve, MIN_TICK_MS - elapsed))
        }
      }
    }
    void loop()
    return () => {
      cancelled = true
    }
  }, [autoRefresh, refresh])

  // Sorted largest-bounds-first: with no z-index while unselected/unhovered,
  // overlapping absolutely-positioned overlays stack by render order - a
  // full-screen container rendered after a button it wraps would otherwise
  // sit on top of it and swallow every click, no matter how small and
  // specific the actual element under the cursor is. Largest-first means the
  // most specific (smallest) element is always painted - and clickable -
  // above whatever contains it, matching how a real touch resolves.
  const visibleElements = (snapshot?.elements ?? [])
    .filter((el) => el.isVisible && el.bounds.width > 0 && el.bounds.height > 0)
    .sort((a, b) => b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height)
  const selectedElement = selectedKey !== null ? snapshot?.elements.find((el) => elementKey(el) === selectedKey) : undefined

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => void refresh()}
              disabled={isLoading}
              className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
            >
              {isLoading ? 'Refreshing…' : 'Refresh now'}
            </button>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => {
                  consecutiveErrorsRef.current = 0
                  setAutoRefresh(e.target.checked)
                }}
                className="accent-sky-600"
              />
              Live (continuous)
            </label>
          </div>
          <p className="text-xs text-slate-600">
            Streams as fast as the device responds — not video, real-device screenshots still take a moment each.
          </p>
        </div>

        {error && <p className="border-b border-red-900/50 bg-red-950/40 px-4 py-2 text-sm text-red-300">{error}</p>}

        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-950 p-4">
          {snapshot ? (
            <div className="relative inline-block" style={{ lineHeight: 0 }}>
              <img src={snapshot.screenshot} alt="Live device screen" className="max-h-[70vh] select-none" draggable={false} />
              {visibleElements.map((el, i) => {
                const key = elementKey(el)
                const isSelected = key === selectedKey
                const isHovered = key === hoveredKey
                return (
                  <div
                    key={`${key}#${i}`}
                    onMouseEnter={() => setHoveredKey(key)}
                    onMouseLeave={() => setHoveredKey((current) => (current === key ? null : current))}
                    onClick={() => setSelectedKey(key)}
                    title={el.locator ? formatLocator(el.locator) : el.type}
                    className={`absolute cursor-pointer border ${
                      isSelected
                        ? 'border-sky-400 bg-sky-400/20'
                        : isHovered
                          ? 'border-emerald-400 bg-emerald-400/10'
                          : 'border-transparent'
                    }`}
                    style={{
                      left: `${(el.bounds.x / snapshot.screen.width) * 100}%`,
                      top: `${(el.bounds.y / snapshot.screen.height) * 100}%`,
                      width: `${(el.bounds.width / snapshot.screen.width) * 100}%`,
                      height: `${(el.bounds.height / snapshot.screen.height) * 100}%`,
                      // Explicit, not left to default stacking order: visibleElements
                      // is sorted largest-area-first, so index alone already ranks
                      // smallest (most specific) on top - selected/hovered gets
                      // boosted above every sibling regardless of its own rank, so
                      // its highlight border is never occluded by an unrelated
                      // smaller element it happens to overlap.
                      zIndex: isSelected || isHovered ? visibleElements.length + 1 : i + 1,
                    }}
                  />
                )
              })}
            </div>
          ) : (
            <div className="text-center text-slate-600">
              <p className="text-sm">{isLoading ? 'Loading live screen…' : 'No snapshot yet'}</p>
            </div>
          )}
        </div>
      </div>

      <aside className="w-72 shrink-0 overflow-y-auto border-l border-slate-800 bg-slate-900">
        <h2 className="border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Element Inspector
        </h2>
        {selectedElement ? (
          <ElementDetails element={selectedElement} />
        ) : (
          <p className="p-4 text-sm text-slate-600 italic">Click an element on the live screen to inspect it</p>
        )}
      </aside>
    </div>
  )
}
