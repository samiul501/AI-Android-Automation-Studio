import { describe, it, expect } from 'vitest'
import { buildDocumentAnalysisMessage } from './prompt.js'

describe('buildDocumentAnalysisMessage', () => {
  it('includes the file name, document type, and document text', () => {
    const message = buildDocumentAnalysisMessage(
      'requirements.pdf',
      'pdf',
      'The login screen must have a Log In button.',
    )
    expect(message).toContain('requirements.pdf')
    expect(message).toContain('(pdf)')
    expect(message).toContain('The login screen must have a Log In button.')
  })
})
