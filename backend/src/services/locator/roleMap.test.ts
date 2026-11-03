import { describe, it, expect } from 'vitest'
import { classNameToRole } from './roleMap.js'

describe('classNameToRole', () => {
  it('maps fully-qualified Android class names to a semantic role', () => {
    expect(classNameToRole('android.widget.Button')).toBe('button')
    expect(classNameToRole('android.widget.EditText')).toBe('textfield')
    expect(classNameToRole('androidx.recyclerview.widget.RecyclerView')).toBe('list')
  })

  it('maps short class names too', () => {
    expect(classNameToRole('Switch')).toBe('switch')
  })

  it('returns undefined for unrecognized or missing class names', () => {
    expect(classNameToRole('com.example.CustomWidget')).toBeUndefined()
    expect(classNameToRole(undefined)).toBeUndefined()
  })
})
