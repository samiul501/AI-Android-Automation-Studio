import type { ExecutionSession } from '../../types/execution'
import { reportDownloadUrl, type ReportFormat } from '../../api/reports'

const REPORT_FORMATS: ReportFormat[] = ['html', 'pdf', 'xlsx', 'json', 'zip']

interface BottomSummaryProps {
  executionSession: ExecutionSession | null
}

export function BottomSummary({ executionSession }: BottomSummaryProps) {
  const items = executionSession?.items ?? []
  const passed = items.filter((item) => item.status === 'passed').length
  const failed = items.filter((item) => ['failed', 'timedOut', 'interrupted', 'stopped'].includes(item.status)).length
  // The report endpoints read from disk - a session is only downloadable once
  // the Execution Engine has actually finished and persisted it.
  const canDownload = executionSession !== null && executionSession.finishedAt !== undefined

  return (
    <footer className="flex items-center justify-between border-t border-slate-800 bg-slate-900 px-6 py-3">
      <div className="flex items-center gap-6 text-sm text-slate-500">
        {executionSession ? (
          <>
            <span>{items.length} test(s)</span>
            <span className="text-emerald-400">{passed} passed</span>
            <span className="text-red-400">{failed} failed</span>
          </>
        ) : (
          <span>No test results yet</span>
        )}
      </div>
      <div className="flex gap-2">
        {REPORT_FORMATS.map((format) =>
          canDownload ? (
            <a
              key={format}
              href={reportDownloadUrl(executionSession.id, format)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium uppercase text-slate-300 hover:bg-slate-800"
            >
              {format}
            </a>
          ) : (
            <button
              key={format}
              disabled
              className="cursor-not-allowed rounded-md border border-slate-800 bg-slate-900 px-3 py-1 text-xs font-medium uppercase text-slate-600"
            >
              {format}
            </button>
          ),
        )}
      </div>
    </footer>
  )
}
