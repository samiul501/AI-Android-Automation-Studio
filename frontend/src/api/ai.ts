import type { FailureAnalysis } from '../types/ai'
import type { ScriptLanguage } from '../types/scripts'

async function parseOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed with HTTP ${response.status}`
    throw new Error(message)
  }
  return body
}

export async function analyzeFailure(executionId: string, itemIndex: number): Promise<FailureAnalysis> {
  const response = await fetch('/api/ai/analyze-failure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ executionId, itemIndex }),
  })
  return (await parseOrThrow(response)) as FailureAnalysis
}

export async function applyAiFix(
  language: ScriptLanguage,
  fileName: string,
  code: string,
): Promise<{ fileName: string; language: ScriptLanguage; code: string; backupFileName: string | null }> {
  const response = await fetch('/api/ai/apply-fix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, fileName, code }),
  })
  return (await parseOrThrow(response)) as {
    fileName: string
    language: ScriptLanguage
    code: string
    backupFileName: string | null
  }
}
