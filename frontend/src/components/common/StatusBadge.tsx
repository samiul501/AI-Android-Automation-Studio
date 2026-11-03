import type { DeviceConnectionState } from '../../types/device'

const STATE_STYLES: Record<DeviceConnectionState, { dot: string; label: string; text: string }> = {
  connected: { dot: 'bg-emerald-500', text: 'text-emerald-400', label: 'Android Device Connected' },
  disconnected: { dot: 'bg-red-500', text: 'text-red-400', label: 'Android Device Not Connected' },
  unauthorized: { dot: 'bg-amber-500', text: 'text-amber-400', label: 'Device Unauthorized' },
  'adb-missing': { dot: 'bg-red-500', text: 'text-red-400', label: 'ADB Not Found' },
  unknown: { dot: 'bg-slate-500', text: 'text-slate-400', label: 'Device Status Not Checked' },
  checking: { dot: 'bg-slate-500', text: 'text-slate-400', label: 'Checking Device…' },
}

export function StatusBadge({ state }: { state: DeviceConnectionState }) {
  const style = STATE_STYLES[state]
  return (
    <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1.5">
      <span
        className={`h-2.5 w-2.5 rounded-full ${style.dot} ${state === 'connected' ? 'animate-pulse' : ''} ${state === 'checking' ? 'animate-ping' : ''}`}
      />
      <span className={`text-sm font-medium ${style.text}`}>{style.label}</span>
    </div>
  )
}
