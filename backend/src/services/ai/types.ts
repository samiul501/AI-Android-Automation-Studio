export interface FailureContext {
  scriptFileName: string
  scriptCode: string
  failedStepTitle?: string
  errorMessage: string
  deviceInfo?: {
    model?: string
    androidVersion?: string
    apiLevel?: number
  }
  recentLogs?: string[]
}

export interface FailureAnalysis {
  summary: string
  likelyCauses: string[]
  suggestedFix: string
  /** Full corrected script source, or '' if no code change is warranted (e.g. an environmental failure). */
  suggestedCodeChange: string
  confidence: 'low' | 'medium' | 'high'
}
