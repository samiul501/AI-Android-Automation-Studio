import type { InspectSnapshot } from '../types/inspector'

async function parseOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed with HTTP ${response.status}`
    throw new Error(message)
  }
  return body
}

export async function fetchInspectSnapshot(): Promise<InspectSnapshot> {
  const response = await fetch('/api/inspector/inspect')
  return (await parseOrThrow(response)) as InspectSnapshot
}
