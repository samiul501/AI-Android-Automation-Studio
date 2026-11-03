import { describe, it, expect } from 'vitest'
import { isSensitiveField, deriveEnvVarName } from './credentials.js'

describe('isSensitiveField', () => {
  it('flags a field explicitly marked as a password input', () => {
    expect(isSensitiveField({ raw: { password: true } })).toBe(true)
  })

  it('flags a field whose resource-id suggests a password', () => {
    expect(isSensitiveField({ resourceId: 'com.example:id/password' })).toBe(true)
  })

  it('flags a field whose hint suggests a PIN', () => {
    expect(isSensitiveField({ raw: { hint: 'Enter your PIN' } })).toBe(true)
  })

  it('flags an email-like captured value even on an unlabeled field', () => {
    expect(isSensitiveField({ resourceId: 'com.example:id/field1' }, 'user@example.com')).toBe(true)
  })

  it('does not flag an ordinary search field', () => {
    expect(isSensitiveField({ resourceId: 'com.example:id/search' }, 'running shoes')).toBe(false)
  })

  it('returns false when there is no element info', () => {
    expect(isSensitiveField(undefined)).toBe(false)
  })
})

describe('deriveEnvVarName', () => {
  it('derives a SCREAMING_SNAKE_CASE name from the resource-id', () => {
    expect(deriveEnvVarName({ resourceId: 'com.example:id/password' })).toBe('TEST_PASSWORD')
  })

  it('splits camelCase resource-id segments', () => {
    expect(deriveEnvVarName({ resourceId: 'com.example:id/userEmail' })).toBe('TEST_USER_EMAIL')
  })

  it('falls back to contentDescription when no resource-id is present', () => {
    expect(deriveEnvVarName({ contentDescription: 'Confirm password' })).toBe('TEST_CONFIRM_PASSWORD')
  })

  it('falls back to a generic name when nothing identifying is available', () => {
    expect(deriveEnvVarName(undefined)).toBe('TEST_INPUT')
  })
})
