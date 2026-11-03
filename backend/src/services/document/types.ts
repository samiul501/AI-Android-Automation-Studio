export type SupportedDocumentType = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt' | 'md' | 'json'

export interface ParsedDocument {
  documentType: SupportedDocumentType
  text: string
  truncated: boolean
  fullTextLength: number
}

// One AI-suggested action within a test case. `locatorExpression` (when present)
// is an unverified guess - the document has no live UI tree to check it
// against, unlike recorded-flow scripts - so every generated script carries a
// review reminder and these are never auto-executed.
export type TestStepAction = 'tap' | 'longPress' | 'doubleTap' | 'fill' | 'clear' | 'swipe' | 'back' | 'assertVisible'

export interface TestStep {
  title: string
  action: TestStepAction
  locatorExpression?: string
  value?: string
  isSensitive?: boolean
}

export interface TestCase {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  steps: TestStep[]
  approved: boolean
}

export interface TestScenario {
  id: string
  title: string
  description: string
  testCases: TestCase[]
}

export interface DocumentAnalysisResult {
  scenarios: TestScenario[]
}

export type DocumentSessionStatus = 'uploaded' | 'analyzing' | 'reviewing' | 'analysis-failed'

export interface GeneratedDocumentScript {
  testCaseId: string
  language: 'typescript' | 'javascript'
  fileName: string
  generatedAt: string
}

export interface DocumentSession {
  id: string
  originalFileName: string
  documentType: SupportedDocumentType
  uploadedAt: string
  extractedText: string
  textPreview: string
  fullTextLength: number
  truncated: boolean
  status: DocumentSessionStatus
  analysisError?: string
  analyzedAt?: string
  scenarios: TestScenario[]
  generatedScripts: GeneratedDocumentScript[]
}
