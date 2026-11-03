export type ConnectionState = 'connected' | 'unauthorized' | 'disconnected' | 'adb-missing'
export type DeviceConnectionState = ConnectionState | 'unknown' | 'checking'

export interface DeviceSummary {
  serial: string
  state: string
}

export interface DeviceDetail extends DeviceSummary {
  model?: string
  manufacturer?: string
  androidVersion?: string
  apiLevel?: number
}

export interface DeviceStatus {
  connectionState: DeviceConnectionState
  adbAvailable: boolean
  devices: DeviceSummary[]
  primaryDevice?: DeviceDetail
  checkedAt?: string
  error?: string
}

export const INITIAL_DEVICE_STATUS: DeviceStatus = {
  connectionState: 'unknown',
  adbAvailable: true,
  devices: [],
}
