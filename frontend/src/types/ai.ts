export interface FailureAnalysis {
  summary: string
  likelyCauses: string[]
  suggestedFix: string
  suggestedCodeChange: string
  confidence: 'low' | 'medium' | 'high'
}
