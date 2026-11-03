import { StatusBadge } from '../common/StatusBadge'
import type { DeviceConnectionState } from '../../types/device'

interface HeaderProps {
  deviceState: DeviceConnectionState
  isCheckingDevice: boolean
  isRecording: boolean
  isRecordingActionPending: boolean
  isDisconnectingDevice: boolean
  isResettingSystem: boolean
  onCheckDevice: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onDisconnectDevice: () => void
  onResetSystem: () => void
}

export function Header({
  deviceState,
  isCheckingDevice,
  isRecording,
  isRecordingActionPending,
  isDisconnectingDevice,
  isResettingSystem,
  onCheckDevice,
  onStartRecording,
  onStopRecording,
  onDisconnectDevice,
  onResetSystem,
}: HeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 bg-slate-900 px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-500/20 text-sky-400 font-bold">
          A
        </div>
        <h1 className="text-lg font-semibold text-slate-100">AI Android Automation Studio</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge state={deviceState} />

        <button
          onClick={onCheckDevice}
          disabled={isCheckingDevice}
          className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-500 transition-colors"
        >
          {isCheckingDevice ? 'Checking…' : 'Check Device'}
        </button>

        <button
          onClick={onDisconnectDevice}
          disabled={isDisconnectingDevice || deviceState === 'adb-missing' || deviceState === 'unknown'}
          title="Runs `adb disconnect` against the device"
          className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-500 transition-colors"
        >
          {isDisconnectingDevice ? 'Disconnecting…' : 'Disconnect'}
        </button>

        <button
          onClick={onStartRecording}
          disabled={isRecording || isRecordingActionPending || deviceState !== 'connected'}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 transition-colors"
        >
          Start Recording
        </button>

        <button
          onClick={onStopRecording}
          disabled={!isRecording || isRecordingActionPending}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500 transition-colors"
        >
          Stop Recording
        </button>

        <div className="mx-1 h-6 w-px bg-slate-700" />

        <button
          onClick={onResetSystem}
          disabled={isResettingSystem}
          title="Permanently deletes all recordings, generated scripts, and reports"
          className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:text-red-800 transition-colors"
        >
          {isResettingSystem ? 'Resetting…' : 'Reset Session'}
        </button>
      </div>
    </header>
  )
}
