import { describe, it, expect } from 'vitest'
import {
  readBounds,
  extractElementInfo,
  findElementAtPoint,
  editableFieldKey,
  findFocusedEditableField,
  collectVisibleTexts,
} from './uiTree.js'

describe('readBounds', () => {
  it('reads {x,y,width,height} bounds', () => {
    expect(readBounds({ bounds: { x: 10, y: 20, width: 100, height: 50 } })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    })
  })

  it('reads {left,top,right,bottom} rect', () => {
    expect(readBounds({ rect: { left: 10, top: 20, right: 110, bottom: 70 } })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    })
  })

  it('reads uiautomator-style "[left,top][right,bottom]" string bounds', () => {
    expect(readBounds({ bounds: '[10,20][110,70]' })).toEqual({ x: 10, y: 20, width: 100, height: 50 })
  })

  it('returns undefined when no bounds field is present', () => {
    expect(readBounds({ text: 'hello' })).toBeUndefined()
  })
})

describe('extractElementInfo', () => {
  it('resolves resourceId, text, and contentDescription across naming aliases', () => {
    const info = extractElementInfo({
      'resource-id': 'com.example:id/login_button',
      'content-desc': 'Log in',
      text: 'Login',
      class: 'android.widget.Button',
      clickable: true,
    })
    expect(info.resourceId).toBe('com.example:id/login_button')
    expect(info.contentDescription).toBe('Log in')
    expect(info.text).toBe('Login')
    expect(info.className).toBe('android.widget.Button')
    expect(info.clickable).toBe(true)
  })

  it('resolves isFocused across naming aliases', () => {
    expect(extractElementInfo({ focused: true }).isFocused).toBe(true)
    expect(extractElementInfo({ isFocused: true }).isFocused).toBe(true)
    expect(extractElementInfo({ focused: false }).isFocused).toBe(false)
    expect(extractElementInfo({}).isFocused).toBeUndefined()
  })

  it('preserves the original node under raw', () => {
    const node = { text: 'hi' }
    expect(extractElementInfo(node).raw).toBe(node)
  })
})

describe('findElementAtPoint', () => {
  const tree = {
    bounds: { x: 0, y: 0, width: 1080, height: 2340 },
    class: 'FrameLayout',
    children: [
      {
        bounds: { x: 0, y: 100, width: 1080, height: 200 },
        class: 'LinearLayout',
        children: [
          {
            bounds: { x: 40, y: 120, width: 300, height: 60 },
            'resource-id': 'com.example:id/username',
            class: 'EditText',
          },
          {
            bounds: { x: 40, y: 200, width: 300, height: 60 },
            'resource-id': 'com.example:id/password',
            class: 'EditText',
          },
        ],
      },
      {
        bounds: { x: 400, y: 2000, width: 200, height: 80 },
        'resource-id': 'com.example:id/login_button',
        class: 'Button',
      },
    ],
  }

  it('finds the deepest leaf element containing the point', () => {
    const match = findElementAtPoint(tree, 100, 140)
    expect(match?.['resource-id']).toBe('com.example:id/username')
  })

  it('picks the sibling whose bounds actually contain the point', () => {
    const match = findElementAtPoint(tree, 500, 2020)
    expect(match?.['resource-id']).toBe('com.example:id/login_button')
  })

  it('returns undefined when the point is outside every node', () => {
    expect(findElementAtPoint(tree, 5000, 5000)).toBeUndefined()
  })

  it('falls back to the containing parent when no child matches exactly', () => {
    const match = findElementAtPoint(tree, 900, 150)
    expect(match?.class).toBe('LinearLayout')
  })
})

describe('editableFieldKey', () => {
  it('keys by resource-id when present', () => {
    expect(editableFieldKey({ resourceId: 'com.example:id/email' })).toBe('id:com.example:id/email')
  })

  it('falls back to className+bounds when there is no resource-id', () => {
    const info = { className: 'android.widget.EditText', bounds: { x: 10, y: 20, width: 300, height: 60 } }
    expect(editableFieldKey(info)).toBe('bounds:android.widget.EditText:10,20,300,60')
  })

  it('returns undefined when neither a resource-id nor bounds are available', () => {
    expect(editableFieldKey({})).toBeUndefined()
  })
})

describe('findFocusedEditableField', () => {
  it('finds the focused EditText among the tree', () => {
    const tree = {
      children: [
        { 'resource-id': 'com.example:id/title', class: 'android.widget.TextView', text: 'Welcome' },
        { 'resource-id': 'com.example:id/email', class: 'android.widget.EditText', text: 'user@', focused: true },
      ],
    }
    expect(findFocusedEditableField(tree)?.resourceId).toBe('com.example:id/email')
  })

  it('returns undefined when no editable field is focused', () => {
    const tree = { 'resource-id': 'com.example:id/email', class: 'android.widget.EditText', text: '', focused: false }
    expect(findFocusedEditableField(tree)).toBeUndefined()
  })

  it('ignores a focused element that is not an editable class', () => {
    const tree = { 'resource-id': 'com.example:id/card', class: 'android.widget.FrameLayout', focused: true }
    expect(findFocusedEditableField(tree)).toBeUndefined()
  })

  it('returns undefined for an undefined tree', () => {
    expect(findFocusedEditableField(undefined)).toBeUndefined()
  })

  it('tracks a SearchView with no resource-id via its className+bounds', () => {
    const tree = {
      class: 'android.widget.SearchView',
      bounds: { x: 0, y: 100, width: 400, height: 50 },
      text: 'sho',
      focused: true,
    }
    const field = findFocusedEditableField(tree)
    expect(field?.text).toBe('sho')
    expect(editableFieldKey(field!)).toBe('bounds:android.widget.SearchView:0,100,400,50')
  })
})

describe('collectVisibleTexts', () => {
  it('collects deduplicated text from every node in the tree', () => {
    const tree = {
      text: 'Welcome',
      children: [{ text: 'Log in' }, { text: 'Log in' }, { children: [{ text: 'Forgot password?' }] }],
    }
    expect(collectVisibleTexts(tree).sort()).toEqual(['Forgot password?', 'Log in', 'Welcome'].sort())
  })

  it('ignores nodes with no text', () => {
    expect(collectVisibleTexts({ class: 'FrameLayout', children: [{ class: 'ImageView' }] })).toEqual([])
  })

  it('trims whitespace-only text', () => {
    expect(collectVisibleTexts({ text: '   ' })).toEqual([])
  })
})
