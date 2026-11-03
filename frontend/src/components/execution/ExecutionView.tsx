import type { ExecutionItem, ExecutionSession } from '../../types/execution'
import type { FailureAnalysis } from '../../types/ai'

const STATUS_LABEL: Record<ExecutionItem['status'], string> = {
  pending: 'Pending',
  running: 'Running',
  passed: 'Passed',
  failed: 'Failed',
  timedOut: 'Timed out',
  skipped: 'Skipped',
  interrupted: 'Interrupted',
  stopped: 'Stopped',
}

const STATUS_COLOR: Record<ExecutionItem['status'], string> = {
  pending: 'text-slate-500',
  running: 'text-sky-400',
  passed: 'text-emerald-400',
  failed: 'text-red-400',
  timedOut: 'text-red-400',
  skipped: 'text-slate-500',
  interrupted: 'text-amber-400',
  stopped: 'text-amber-400',
}

const ANALYZABLE_STATUSES: ExecutionItem['status'][] = ['failed', 'timedOut', 'interrupted']

export type AnalysisState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; analysis: FailureAnalysis }

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

const CONFIDENCE_COLOR: Record<FailureAnalysis['confidence'], string> = {
  low: 'text-amber-400',
  medium: 'text-sky-400',
  high: 'text-emerald-400',
}

function FailureAnalysisPanel({
  analysisState,
  isApplyingFix,
  onApplyFix,
}: {
  analysisState: AnalysisState
  isApplyingFix: boolean
  onApplyFix: (code: string) => void
}) {
  if (analysisState.status === 'loading') {
    return <p className="mt-3 text-xs text-slate-500 italic">Analyzing failure…</p>
  }
  if (analysisState.status === 'error') {
    return <p className="mt-3 text-xs text-red-400">{analysisState.message}</p>
  }

  const { analysis } = analysisState
  return (
    <div className="mt-3 rounded border border-slate-700 bg-slate-900/60 p-3 text-xs">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold text-slate-300">AI Analysis</span>
        <span className={CONFIDENCE_COLOR[analysis.confidence]}>{analysis.confidence} confidence</span>
      </div>
      <p className="text-slate-300">{analysis.summary}</p>
      {analysis.likelyCauses.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-slate-400">
          {analysis.likelyCauses.map((cause, i) => (
            <li key={i}>{cause}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-slate-400">{analysis.suggestedFix}</p>
      {analysis.suggestedCodeChange && (
        <div className="mt-2">
          <details>
            <summary className="cursor-pointer text-sky-400">View suggested script</summary>
            <pre className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded bg-slate-950 p-2 text-slate-400">
              {analysis.suggestedCodeChange}
            </pre>
          </details>
          <button
            onClick={() => onApplyFix(analysis.suggestedCodeChange)}
            disabled={isApplyingFix}
            className="mt-2 rounded bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
          >
            {isApplyingFix ? 'Applying…' : 'Apply AI Fix'}
          </button>
        </div>
      )}
    </div>
  )
}

interface ItemViewProps {
  item: ExecutionItem
  totalSteps?: number
  analysisState?: AnalysisState
  isApplyingFix: boolean
  onAnalyzeFailure: () => void
  onApplyFix: (code: string) => void
  onRunAgain: () => void
}

function ItemView({
  item,
  totalSteps,
  analysisState,
  isApplyingFix,
  onAnalyzeFailure,
  onApplyFix,
  onRunAgain,
}: ItemViewProps) {
  const passedSteps = item.steps.filter((s) => s.status === 'passed').length
  const progressTotal =
    totalSteps ?? (item.status === 'running' || item.status === 'pending' ? undefined : item.steps.length)
  const progressPct =
    progressTotal && progressTotal > 0 ? Math.round((item.steps.length / progressTotal) * 100) : undefined
  const canAnalyze = ANALYZABLE_STATUSES.includes(item.status)

  return (
    <div className="border-b border-slate-800 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-sm text-slate-300">{item.fileName}</span>
        <span className={`text-sm font-medium ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span>
      </div>

      <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
        <span>Duration: {formatDuration(item.durationMs)}</span>
        <span>
          Steps passed: {passedSteps}
          {totalSteps ? ` / ${totalSteps}` : ''}
        </span>
        {progressPct !== undefined && <span>{progressPct}%</span>}
      </div>

      <ul className="space-y-1">
        {item.steps.map((step, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className={step.status === 'passed' ? 'text-emerald-400' : 'text-red-400'}>
              {step.status === 'passed' ? '✓' : '✗'}
            </span>
            <span className="text-slate-300">{step.title}</span>
            <span className="ml-auto text-xs text-slate-600">{formatDuration(step.durationMs)}</span>
          </li>
        ))}
        {item.status === 'running' && item.currentStepTitle && (
          <li className="flex items-center gap-2 text-sm">
            <span className="text-sky-400">⏳</span>
            <span className="text-slate-300">{item.currentStepTitle}</span>
          </li>
        )}
        {item.status === 'pending' && <li className="text-sm text-slate-600">○ Waiting to start…</li>}
      </ul>

      {item.error && (
        <div className="mt-3 rounded border border-red-900/50 bg-red-950/40 p-2 text-xs text-red-300">{item.error}</div>
      )}

      {canAnalyze && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={onAnalyzeFailure}
            disabled={analysisState?.status === 'loading'}
            className="rounded border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
          >
            AI Analyze Failure
          </button>
          <button
            onClick={onRunAgain}
            className="rounded border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            Run Again
          </button>
        </div>
      )}

      {analysisState && (
        <FailureAnalysisPanel analysisState={analysisState} isApplyingFix={isApplyingFix} onApplyFix={onApplyFix} />
      )}

      {item.screenshots.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.screenshots.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer">
              <img src={src} alt="Failure screenshot" className="h-20 w-auto rounded border border-slate-700" />
            </a>
          ))}
        </div>
      )}

      {item.logs.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-500">Logs ({item.logs.length} lines)</summary>
          <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-slate-500">
            {item.logs.join('\n')}
          </pre>
        </details>
      )}
    </div>
  )
}

interface ExecutionViewProps {
  session: ExecutionSession | null
  stepTotals: Record<string, number>
  analyses: Record<number, AnalysisState>
  applyingFixIndex: number | null
  onAnalyzeFailure: (index: number) => void
  onApplyFix: (index: number, code: string) => void
  onRunAgain: (index: number) => void
}

export function ExecutionView({
  session,
  stepTotals,
  analyses,
  applyingFixIndex,
  onAnalyzeFailure,
  onApplyFix,
  onRunAgain,
}: ExecutionViewProps) {
  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center text-slate-600">
          <p className="text-sm">No execution in progress</p>
          <p className="mt-1 text-xs">Run a script to see live step-by-step status here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {session.items.map((item, i) => (
        <ItemView
          key={`${item.language}/${item.fileName}/${i}`}
          item={item}
          totalSteps={stepTotals[`${item.language}:${item.fileName}`]}
          analysisState={analyses[i]}
          isApplyingFix={applyingFixIndex === i}
          onAnalyzeFailure={() => onAnalyzeFailure(i)}
          onApplyFix={(code) => onApplyFix(i, code)}
          onRunAgain={() => onRunAgain(i)}
        />
      ))}
    </div>
  )
}
