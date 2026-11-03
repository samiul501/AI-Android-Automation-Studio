import type { DeviceStatus } from '../../types/device'
import type { MobilewrightReadiness } from '../../types/automation'
import type { RecordingSession } from '../../types/recording'
import type { ExecutionSession } from '../../types/execution'
import { describeAction } from '../../utils/describeAction'

function InfoRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300">{value ?? '—'}</span>
    </div>
  )
}

interface RightPanelProps {
  status: DeviceStatus
  mobilewrightReadiness: MobilewrightReadiness | null
  recordingSession: RecordingSession | null
  recordingError: string | null
  executionSession: ExecutionSession | null
}

export function RightPanel({
  status,
  mobilewrightReadiness,
  recordingSession,
  recordingError,
  executionSession,
}: RightPanelProps) {
  const device = status.primaryDevice
  const manufacturerModel = [device?.manufacturer, device?.model].filter(Boolean).join(' ')

  const runningItem = executionSession?.items[executionSession.currentIndex]
  const activeLogItem =
    [...(executionSession?.items ?? [])].reverse().find((item) => item.logs.length > 0) ?? runningItem

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-slate-800 bg-slate-900">
      <section className="border-b border-slate-800 p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Device Information</h2>
        <InfoRow label="Model" value={manufacturerModel || undefined} />
        <InfoRow label="Serial" value={device?.serial} />
        <InfoRow label="Android Version" value={device?.androidVersion} />
        <InfoRow label="API Level" value={device?.apiLevel} />
        <InfoRow label="Connection" value={status.connectionState} />
        <InfoRow label="Authorized" value={device ? (device.state === 'device' ? 'Yes' : 'No') : undefined} />
        {status.checkedAt && (
          <p className="mt-2 text-xs text-slate-600">Last checked {new Date(status.checkedAt).toLocaleTimeString()}</p>
        )}
      </section>

      <section className="border-b border-slate-800 p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Automation Engine</h2>
        {mobilewrightReadiness === null ? (
          <p className="text-sm text-slate-600 italic">Not checked yet</p>
        ) : mobilewrightReadiness.ready ? (
          <p className="text-sm text-emerald-400">Mobilewright ready (mobilecli + ADB)</p>
        ) : (
          <div className="text-sm text-amber-400">
            <p>Mobilewright not ready:</p>
            <ul className="mt-1 list-inside list-disc text-amber-300/90">
              {mobilewrightReadiness.requiredChecks
                .filter((check) => check.status !== 'ok')
                .map((check) => (
                  <li key={check.id}>
                    {check.name}
                    {check.details ? ` — ${check.details}` : ''}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      <section className="border-b border-slate-800 p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recording Information</h2>
        {recordingError && <p className="mb-2 text-sm text-red-400">{recordingError}</p>}
        {recordingSession ? (
          <div>
            <p className={`text-sm ${recordingSession.status === 'recording' ? 'text-emerald-400' : 'text-slate-400'}`}>
              {recordingSession.status === 'recording' ? 'Recording…' : 'Stopped'} · {recordingSession.actions.length}{' '}
              action
              {recordingSession.actions.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto text-xs text-slate-400">
              {recordingSession.actions
                .slice(-8)
                .reverse()
                .map((action) => (
                  <li key={action.id}>
                    <p className="truncate text-slate-300">{describeAction(action)}</p>
                    {action.locator && (
                      <p className="truncate font-mono text-[11px] text-sky-400/80" title={action.locator.best.reason}>
                        {action.locator.best.expression} · {action.locator.best.confidence}%
                      </p>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          !recordingError && <p className="text-sm text-slate-600 italic">Not recording</p>
        )}
      </section>

      <section className="border-b border-slate-800 p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Execution Status</h2>
        {executionSession ? (
          <div>
            <p className="text-sm text-slate-300">
              Session {executionSession.status}
              {executionSession.status === 'running' &&
                ` · item ${executionSession.currentIndex + 1}/${executionSession.items.length}`}
            </p>
            {runningItem && (
              <p className="mt-1 truncate font-mono text-xs text-slate-500">
                {runningItem.fileName} — {runningItem.currentStepTitle ?? runningItem.status}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-600 italic">No execution running</p>
        )}
      </section>

      <section className="flex-1 overflow-y-auto p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Live Logs</h2>
        {activeLogItem && activeLogItem.logs.length > 0 ? (
          <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap text-xs text-slate-500">
            {activeLogItem.logs.slice(-30).join('\n')}
          </pre>
        ) : (
          <p className="text-sm text-slate-600 italic">No logs yet</p>
        )}
      </section>
    </aside>
  )
}
