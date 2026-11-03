async function parseOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed with HTTP ${response.status}`
    throw new Error(message)
  }
  return body
}

// Irreversible: stops any in-flight recording/execution and deletes every
// saved recording, generated script, and report. Callers must confirm with
// the user before invoking this.
export async function resetSystem(): Promise<void> {
  const response = await fetch('/api/system/reset', { method: 'POST' })
  await parseOrThrow(response)
}
