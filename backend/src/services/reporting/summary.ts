import type { ExecutionItemStatus, ExecutionSession } from '../execution/types.js'

export interface ReportSummary {
  total: number
  passed: number
  failed: number
  timedOut: number
  skipped: number
  interrupted: number
  stopped: number
  pending: number
  running: number
  durationMs: number | undefined
}

const ZERO_COUNTS: Record<ExecutionItemStatus, number> = {
  pending: 0,
  running: 0,
  passed: 0,
  failed: 0,
  timedOut: 0,
  skipped: 0,
  interrupted: 0,
  stopped: 0,
}

export function computeSummary(session: ExecutionSession): ReportSummary {
  const counts = { ...ZERO_COUNTS }
  for (const item of session.items) counts[item.status]++

  const durationMs =
    session.finishedAt !== undefined
      ? new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()
      : undefined

  return { total: session.items.length, ...counts, durationMs }
}
