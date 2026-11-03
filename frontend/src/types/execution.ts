import type { ScriptLanguage } from './scripts'

export type ExecutionStepStatus = 'passed' | 'failed'

export interface ExecutionStep {
  title: string
  status: ExecutionStepStatus
  durationMs: number
  error?: string
}

export type ExecutionItemStatus =
  'pending' | 'running' | 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted' | 'stopped'

export interface ExecutionItem {
  language: ScriptLanguage
  fileName: string
  status: ExecutionItemStatus
  currentStepTitle?: string
  steps: ExecutionStep[]
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  error?: string
  screenshots: string[]
  logs: string[]
}

export type ExecutionSessionStatus = 'running' | 'completed' | 'stopped'

export interface ExecutionSession {
  id: string
  startedAt: string
  finishedAt?: string
  status: ExecutionSessionStatus
  items: ExecutionItem[]
  currentIndex: number
}
