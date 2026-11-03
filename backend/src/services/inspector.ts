import { ios, android } from 'mobilewright'
import { start, type InspectorServer } from '@mobilewright/inspector'
import { logger } from '../config/logger.js'
import { checkDeviceStatus } from './deviceManager.js'

// Started lazily, on first use, rather than at boot - nothing should pay the
// cost of a mobilecli-connected server until the Live Inspector panel is
// actually opened. `port: 0` lets the OS assign a free port, so this never
// collides with a user separately running `npx mobilewright inspect`
// (which defaults to 4621) or with any other service on this machine.
let server: InspectorServer | undefined
let startPromise: Promise<InspectorServer> | undefined

export async function ensureInspectorServer(): Promise<InspectorServer> {
  if (server) return server
  if (!startPromise) {
    startPromise = start({ ios, android, port: 0 })
      .then((started) => {
        server = started
        logger.info('Mobilewright Inspector server started', { url: started.url })
        return started
      })
      .catch((error) => {
        startPromise = undefined
        throw error
      })
  }
  return startPromise
}

export async function closeInspectorServer(): Promise<void> {
  if (server) {
    await server.close()
    server = undefined
  }
  startPromise = undefined
}

export async function inspectorFetch(path: string, init?: RequestInit): Promise<Response> {
  const runningServer = await ensureInspectorServer()
  return fetch(`${runningServer.url}${path}`, init)
}

interface InspectorDevicesResponse {
  devices: Array<{ id: string; platform: 'ios' | 'android' }>
  activeId: string | null
}

// The inspector keeps at most one selected device; this app only ever has
// one device connected, so callers auto-select it (matching what the
// recorder and execution engine already treat as "the" device) instead of
// surfacing a separate device picker. Shared by the Inspector UI route and
// by the recording session, which also needs the Inspector's own element
// list (see recording/liveCapture.ts) rather than picking a device itself.
export async function ensureInspectorDeviceSelected(serial?: string): Promise<string | undefined> {
  let targetSerial = serial
  if (!targetSerial) {
    const status = await checkDeviceStatus()
    targetSerial = status.primaryDevice?.serial
    if (!targetSerial || status.connectionState !== 'connected') return undefined
  }

  const devicesRes = await inspectorFetch('/api/devices')
  const devicesBody = (await devicesRes.json()) as InspectorDevicesResponse
  if (devicesBody.activeId === targetSerial) return targetSerial

  const selectRes = await inspectorFetch(`/api/devices/${encodeURIComponent(targetSerial)}/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'android' }),
  })
  if (!selectRes.ok) {
    const body = (await selectRes.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Failed to select device (HTTP ${selectRes.status})`)
  }
  return targetSerial
}
