export type ScriptLanguage = 'typescript' | 'javascript'

export interface ScriptGenerationOptions {
  language: ScriptLanguage
  testName?: string
}

export interface GeneratedScript {
  language: ScriptLanguage
  fileName: string
  code: string
  /** Env vars the generated script expects the user to supply, e.g. TEST_PASSWORD. */
  requiredEnvVars: string[]
}
