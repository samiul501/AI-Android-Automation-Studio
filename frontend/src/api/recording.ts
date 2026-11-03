import type { RecordingSession } from '../types/recording'

async function parseOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed with HTTP ${response.status}`
    throw new Error(message)
  }
  return body
}

export async function startRecording(): Promise<RecordingSession> {
  const response = await fetch('/api/recording/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return (await parseOrThrow(response)) as RecordingSession
}

export async function stopRecording(): Promise<RecordingSession> {
  const response = await fetch('/api/recording/stop', { method: 'POST' })
  return (await parseOrThrow(response)) as RecordingSession
}

export async function fetchActiveRecording(): Promise<RecordingSession | null> {
  const response = await fetch('/api/recording/active')
  const body = (await parseOrThrow(response)) as { session: RecordingSession | null }
  return body.session
}

export async function listRecordings(): Promise<RecordingSession[]> {
  const response = await fetch('/api/recording')
  return (await parseOrThrow(response)) as RecordingSession[]
}
