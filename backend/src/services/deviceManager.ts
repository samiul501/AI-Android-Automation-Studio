import { AdbNotFoundError, isAdbAvailable, runAdb, runAdbAllowNonZeroExit } from './adb.js'
import { logger } from '../config/logger.js'

export type AdbDeviceState = 'device' | 'unauthorized' | 'offline' | 'no permissions' | 'unknown'

export interface DeviceSummary {
  serial: string
  state: AdbDeviceState
}

export interface DeviceDetail extends DeviceSummary {
  model?: string
  manufacturer?: string
  androidVersion?: string
  apiLevel?: number
}

export type ConnectionState = 'connected' | 'unauthorized' | 'disconnected' | 'adb-missing'

export interface DeviceStatusResult {
  adbAvailable: boolean
  connectionState: ConnectionState
  devices: DeviceSummary[]
  primaryDevice?: DeviceDetail
  checkedAt: string
  error?: string
}

const KNOWN_STATES: AdbDeviceState[] = ['device', 'unauthorized', 'offline', 'no permissions']

function parseAdbState(raw: string): AdbDeviceState {
  return (KNOWN_STATES as string[]).includes(raw) ? (raw as AdbDeviceState) : 'unknown'
}

// Parses the output of `adb devices -l`, e.g.:
//   List of devices attached
//   R58M12ABCDE    device usb:1-1 product:beyond1qlte model:SM_G973N transport_id:1
//   ABCD1234       unauthorized usb:1-2 transport_id:2
export function parseDevicesOutput(stdout: string): DeviceSummary[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('List of devices'))
    .map((line) => {
      const [serial, state] = line.split(/\s+/)
      return { serial, state: parseAdbState(state) }
    })
}

// Parses the output of `adb -s <serial> shell getprop`, e.g. `[ro.product.model]: [SM_G973N]`
export function parseGetprop(stdout: string, keys: string[]): Record<string, string> {
  const values: Record<string, string> = {}
  const pattern = /^\[([^\]]+)]:\s*\[(.*)]$/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(stdout)) !== null) {
    const [, key, value] = match
    if (keys.includes(key)) values[key] = value
  }
  return values
}

export interface DisconnectResult {
  stdout: string
  stderr: string
}

// `adb disconnect` only tears down TCP/IP-connected devices - for the
// USB-attached devices this app targets, adb will report there's nothing to
// disconnect. We surface adb's real stdout/stderr rather than pretending the
// device went away, per the "never fake connection status" rule.
export async function disconnectDevice(serial?: string): Promise<DisconnectResult> {
  return runAdbAllowNonZeroExit(serial ? ['disconnect', serial] : ['disconnect'])
}

async function getDeviceProperties(
  serial: string,
): Promise<Pick<DeviceDetail, 'model' | 'manufacturer' | 'androidVersion' | 'apiLevel'>> {
  const keys = ['ro.product.model', 'ro.product.manufacturer', 'ro.build.version.release', 'ro.build.version.sdk']
  const { stdout } = await runAdb(['-s', serial, 'shell', 'getprop'])
  const props = parseGetprop(stdout, keys)

  const apiLevelRaw = props['ro.build.version.sdk']
  return {
    model: props['ro.product.model'],
    manufacturer: props['ro.product.manufacturer'],
    androidVersion: props['ro.build.version.release'],
    apiLevel: apiLevelRaw ? Number.parseInt(apiLevelRaw, 10) : undefined,
  }
}

export async function checkDeviceStatus(): Promise<DeviceStatusResult> {
  const checkedAt = new Date().toISOString()

  const adbAvailable = await isAdbAvailable()
  if (!adbAvailable) {
    return {
      adbAvailable: false,
      connectionState: 'adb-missing',
      devices: [],
      checkedAt,
      error: 'ADB / Android SDK Platform-Tools is required.',
    }
  }

  try {
    const { stdout } = await runAdb(['devices', '-l'])
    const devices = parseDevicesOutput(stdout)
    const primarySummary = devices.find((d) => d.state === 'device') ?? devices[0]

    let primaryDevice: DeviceDetail | undefined
    if (primarySummary) {
      primaryDevice = { ...primarySummary }
      if (primarySummary.state === 'device') {
        try {
          Object.assign(primaryDevice, await getDeviceProperties(primarySummary.serial))
        } catch (error) {
          logger.warn('Failed to read device properties', { serial: primarySummary.serial, error: String(error) })
        }
      }
    }

    let connectionState: ConnectionState = 'disconnected'
    if (primarySummary?.state === 'device') connectionState = 'connected'
    else if (primarySummary?.state === 'unauthorized') connectionState = 'unauthorized'

    return { adbAvailable: true, connectionState, devices, primaryDevice, checkedAt }
  } catch (error) {
    if (error instanceof AdbNotFoundError) {
      return { adbAvailable: false, connectionState: 'adb-missing', devices: [], checkedAt, error: error.message }
    }
    logger.error('Device status check failed', { error: String(error) })
    return {
      adbAvailable: true,
      connectionState: 'disconnected',
      devices: [],
      checkedAt,
      error: error instanceof Error ? error.message : 'Unknown error checking device status',
    }
  }
}
