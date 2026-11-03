import type { ExecutionSession } from '../types/execution'

export type ReportFormat = 'html' | 'pdf' | 'xlsx' | 'json' | 'zip'

async function parseOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed with HTTP ${response.status}`
    throw new Error(message)
  }
  return body
}

export async function listReports(): Promise<ExecutionSession[]> {
  const response = await fetch('/api/reports')
  return (await parseOrThrow(response)) as ExecutionSession[]
}

export function reportDownloadUrl(id: string, format: ReportFormat): string {
  return `/api/reports/${id}/${format}`
}
