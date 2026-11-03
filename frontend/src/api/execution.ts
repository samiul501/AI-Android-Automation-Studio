import type { ExecutionSession } from '../types/execution'
import type { ScriptLanguage } from '../types/scripts'

async function parseOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed with HTTP ${response.status}`
    throw new Error(message)
  }
  return body
}

export async function runExecution(
  scripts: { language: ScriptLanguage; fileName: string }[],
): Promise<ExecutionSession> {
  const response = await fetch('/api/execution/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scripts }),
  })
  return (await parseOrThrow(response)) as ExecutionSession
}

export async function stopExecution(): Promise<ExecutionSession> {
  const response = await fetch('/api/execution/stop', { method: 'POST' })
  return (await parseOrThrow(response)) as ExecutionSession
}

export async function fetchActiveExecution(): Promise<ExecutionSession | null> {
  const response = await fetch('/api/execution/active')
  const body = (await parseOrThrow(response)) as { session: ExecutionSession | null }
  return body.session
}

export async function listExecutions(): Promise<ExecutionSession[]> {
  const response = await fetch('/api/execution')
  return (await parseOrThrow(response)) as ExecutionSession[]
}
