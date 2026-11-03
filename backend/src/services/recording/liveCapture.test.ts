import { describe, it, expect, vi } from 'vitest'

const runMobilecli = vi.fn()
vi.mock('../mobilecliCli.js', () => ({ runMobilecli: (...args: unknown[]) => runMobilecli(...args) }))

const inspectorFetch = vi.fn()
const ensureInspectorDeviceSelected = vi.fn()
vi.mock('../inspector.js', () => ({
  inspectorFetch: (...args: unknown[]) => inspectorFetch(...args),
  ensureInspectorDeviceSelected: (...args: unknown[]) => ensureInspectorDeviceSelected(...args),
}))

const { normalizeSnapshot, getForegroundApp, getInspectorElements, elementsToRawTree, INSPECTOR_LOCATORS_KEY } =
  await import('./liveCapture.js')

describe('normalizeSnapshot', () => {
  it('unwraps the {status, data: {elements}} envelope that `mobilecli dump ui --format json` actually returns', () => {
    const parsed = {
      status: 'ok',
      data: { elements: [{ 'resource-id': 'com.example:id/a' }, { 'resource-id': 'com.example:id/b' }] },
    }
    expect(normalizeSnapshot(parsed)).toEqual({
      children: [{ 'resource-id': 'com.example:id/a' }, { 'resource-id': 'com.example:id/b' }],
    })
  })

  it('returns undefined when the envelope reports a non-ok status', () => {
    expect(normalizeSnapshot({ status: 'error', data: { message: 'no device' } })).toBeUndefined()
  })

  it('accepts an already-unwrapped {elements} shape (e.g. the RPC agent path)', () => {
    const parsed = { elements: [{ text: 'hello' }] }
    expect(normalizeSnapshot(parsed)).toEqual({ children: [{ text: 'hello' }] })
  })

  it('accepts a bare array of elements', () => {
    expect(normalizeSnapshot([{ text: 'a' }, { text: 'b' }])).toEqual({ children: [{ text: 'a' }, { text: 'b' }] })
  })

  it('falls back to treating the object itself as the root node when nothing recognizable is found', () => {
    const parsed = { bounds: { x: 0, y: 0, width: 100, height: 100 }, children: [{ text: 'child' }] }
    expect(normalizeSnapshot(parsed)).toEqual(parsed)
  })

  it('returns undefined for null or non-object input', () => {
    expect(normalizeSnapshot(null)).toBeUndefined()
    expect(normalizeSnapshot('not json')).toBeUndefined()
    expect(normalizeSnapshot(42)).toBeUndefined()
  })
})

describe('getForegroundApp', () => {
  it('extracts packageName from the {status, data} envelope `apps foreground` actually returns', async () => {
    runMobilecli.mockResolvedValueOnce({
      stdout: JSON.stringify({ status: 'ok', data: { packageName: 'com.daraz.android', appName: 'com.daraz.android' } }),
      stderr: '',
      exitCode: 0,
    })
    expect(await getForegroundApp('ABC123')).toBe('com.daraz.android')
  })

  it('returns undefined when the envelope reports a non-ok status', async () => {
    runMobilecli.mockResolvedValueOnce({
      stdout: JSON.stringify({ status: 'error', data: { message: 'no foreground app' } }),
      stderr: '',
      exitCode: 0,
    })
    expect(await getForegroundApp('ABC123')).toBeUndefined()
  })

  it('returns undefined on a non-zero exit code without touching stdout as a package name', async () => {
    runMobilecli.mockResolvedValueOnce({ stdout: '{"status":"error"}', stderr: '', exitCode: 1 })
    expect(await getForegroundApp('ABC123')).toBeUndefined()
  })

  it('returns undefined when stdout is not valid JSON', async () => {
    runMobilecli.mockResolvedValueOnce({ stdout: 'com.example.app', stderr: '', exitCode: 0 })
    expect(await getForegroundApp('ABC123')).toBeUndefined()
  })
})

describe('getInspectorElements', () => {
  it('returns undefined without hitting the Inspector when no device could be selected', async () => {
    ensureInspectorDeviceSelected.mockResolvedValueOnce(undefined)
    expect(await getInspectorElements('ABC123')).toBeUndefined()
    expect(inspectorFetch).not.toHaveBeenCalled()
  })

  it('returns the element list from a successful /api/inspect response', async () => {
    ensureInspectorDeviceSelected.mockResolvedValueOnce('ABC123')
    const elements = [{ resourceId: 'com.example:id/login', locators: [{ kind: 'testId', value: 'com.example:id/login' }] }]
    inspectorFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ elements }) })
    expect(await getInspectorElements('ABC123')).toEqual(elements)
  })

  it('returns undefined when the Inspector responds with a non-OK status', async () => {
    ensureInspectorDeviceSelected.mockResolvedValueOnce('ABC123')
    inspectorFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    expect(await getInspectorElements('ABC123')).toBeUndefined()
  })

  it('returns undefined when the Inspector request throws', async () => {
    ensureInspectorDeviceSelected.mockResolvedValueOnce('ABC123')
    inspectorFetch.mockRejectedValueOnce(new Error('device disconnected'))
    expect(await getInspectorElements('ABC123')).toBeUndefined()
  })
})

describe('elementsToRawTree', () => {
  it('returns undefined when there is no element list', () => {
    expect(elementsToRawTree(undefined)).toBeUndefined()
  })

  it('wraps elements as a flat, bounds-less root so a touch outside every element resolves to none', () => {
    const tree = elementsToRawTree([
      {
        resourceId: 'com.example:id/login',
        text: null,
        value: null,
        label: 'Log in',
        type: 'android.widget.Button',
        bounds: { x: 10, y: 20, width: 100, height: 40 },
        isEnabled: true,
        isFocused: false,
        raw: { scrollable: false },
        locator: { kind: 'testId', value: 'com.example:id/login' },
        locators: [{ kind: 'testId', value: 'com.example:id/login' }],
      },
    ])

    expect(tree).toMatchObject({
      children: [
        {
          resourceId: 'com.example:id/login',
          contentDescription: 'Log in',
          className: 'android.widget.Button',
          bounds: { x: 10, y: 20, width: 100, height: 40 },
          clickable: true,
          scrollable: false,
          [INSPECTOR_LOCATORS_KEY]: [{ kind: 'testId', value: 'com.example:id/login' }],
        },
      ],
    })
    expect(tree).not.toHaveProperty('bounds')
  })

  it('falls back to the field value when an editable element has no static text', () => {
    const tree = elementsToRawTree([
      {
        resourceId: 'com.example:id/email',
        text: null,
        value: 'user@example.com',
        label: null,
        type: 'android.widget.EditText',
        bounds: { x: 0, y: 0, width: 100, height: 40 },
        isEnabled: true,
        isFocused: true,
        locator: null,
        locators: [],
      },
    ])
    expect(tree).toMatchObject({ children: [{ text: 'user@example.com' }] })
  })
})
