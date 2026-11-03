import type { ScriptContent, ScriptFileSummary, ScriptLanguage } from '../types/scripts'

async function parseOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed with HTTP ${response.status}`
    throw new Error(message)
  }
  return body
}

export async function listScripts(): Promise<ScriptFileSummary[]> {
  const response = await fetch('/api/scripts')
  return (await parseOrThrow(response)) as ScriptFileSummary[]
}

export async function fetchScript(language: ScriptLanguage, fileName: string): Promise<ScriptContent> {
  const response = await fetch(`/api/scripts/${language}/${encodeURIComponent(fileName)}`)
  return (await parseOrThrow(response)) as ScriptContent
}

export async function saveScript(language: ScriptLanguage, fileName: string, code: string): Promise<ScriptContent> {
  const response = await fetch(`/api/scripts/${language}/${encodeURIComponent(fileName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  return (await parseOrThrow(response)) as ScriptContent
}

export async function generateScript(
  recordingId: string,
  language: ScriptLanguage,
  testName?: string,
): Promise<ScriptContent> {
  const response = await fetch('/api/scripts/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordingId, language, testName }),
  })
  return (await parseOrThrow(response)) as ScriptContent
}
