export type ScriptLanguage = 'typescript' | 'javascript'

export interface ScriptFileSummary {
  fileName: string
  language: ScriptLanguage
  sizeBytes: number
  modifiedAt: string
}

export interface ScriptContent {
  fileName: string
  language: ScriptLanguage
  code: string
  requiredEnvVars?: string[]
}
