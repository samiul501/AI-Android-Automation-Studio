import type { ElementInfo } from '../recording/types.js'

const SENSITIVE_PATTERN = /password|passwd|pwd|secret|pin\b|otp/i
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Never embed a literal credential in generated code. A field counts as
// sensitive if the on-device UI marks it as a password input, or if its
// resource-id/label/hint suggests one, or if the captured value itself looks
// like an email address (common for username fields, still worth routing
// through test data rather than hardcoding).
export function isSensitiveField(element: ElementInfo | undefined, capturedText?: string): boolean {
  if (!element) return false
  if (element.raw?.password === true) return true

  const haystack = [element.resourceId, element.contentDescription, element.raw?.hint].filter(
    (value): value is string => typeof value === 'string',
  )
  if (haystack.some((value) => SENSITIVE_PATTERN.test(value))) return true

  return typeof capturedText === 'string' && EMAIL_LIKE.test(capturedText)
}

// Derives a TEST_-prefixed, SCREAMING_SNAKE_CASE env var name from whatever
// identifying info is available, e.g. "com.example:id/password" -> TEST_PASSWORD.
export function deriveEnvVarName(element: ElementInfo | undefined): string {
  const source = element?.resourceId?.split(/[:/]/).pop() ?? element?.contentDescription ?? 'input'
  const slug = source
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
  return `TEST_${slug || 'VALUE'}`
}
