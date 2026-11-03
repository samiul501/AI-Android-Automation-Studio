import type { DocumentSession, TestScenario } from '../types/document'
import type { ScriptContent, ScriptLanguage } from '../types/scripts'

async function parseOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed with HTTP ${response.status}`
    throw new Error(message)
  }
  return body
}

export async function uploadDocument(file: File): Promise<DocumentSession> {
  const formData = new FormData()
  formData.append('document', file)
  const response = await fetch('/api/documents/upload', { method: 'POST', body: formData })
  return (await parseOrThrow(response)) as DocumentSession
}

export async function listDocuments(): Promise<DocumentSession[]> {
  const response = await fetch('/api/documents')
  return (await parseOrThrow(response)) as DocumentSession[]
}

export async function getDocument(id: string): Promise<DocumentSession> {
  const response = await fetch(`/api/documents/${id}`)
  return (await parseOrThrow(response)) as DocumentSession
}

export async function analyzeDocument(id: string): Promise<DocumentSession> {
  const response = await fetch(`/api/documents/${id}/analyze`, { method: 'POST' })
  return (await parseOrThrow(response)) as DocumentSession
}

export async function updateScenarios(id: string, scenarios: TestScenario[]): Promise<DocumentSession> {
  const response = await fetch(`/api/documents/${id}/scenarios`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarios }),
  })
  return (await parseOrThrow(response)) as DocumentSession
}

export async function generateDocumentScript(
  id: string,
  testCaseId: string,
  language: ScriptLanguage,
): Promise<ScriptContent> {
  const response = await fetch(`/api/documents/${id}/generate-script`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ testCaseId, language }),
  })
  return (await parseOrThrow(response)) as ScriptContent
}
