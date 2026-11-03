import type { DeviceStatus } from '../types/device'

async function parseOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed with HTTP ${response.status}`
    throw new Error(message)
  }
  return body
}

export async function fetchDeviceStatus(): Promise<DeviceStatus> {
  const response = await fetch('/api/device/status')
  if (!response.ok) {
    throw new Error(`Device status check failed with HTTP ${response.status}`)
  }
  return response.json()
}

export interface DisconnectDeviceResult {
  stdout: string
  stderr: string
  status: DeviceStatus
}

export async function disconnectDevice(serial?: string): Promise<DisconnectDeviceResult> {
  const response = await fetch('/api/device/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serial }),
  })
  return (await parseOrThrow(response)) as DisconnectDeviceResult
}
