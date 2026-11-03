import type { ExecutionItem, ExecutionSession } from '../execution/types.js'
import { computeSummary } from './summary.js'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

const STATUS_COLOR: Record<ExecutionItem['status'], string> = {
  pending: '#64748b',
  running: '#38bdf8',
  passed: '#34d399',
  failed: '#f87171',
  timedOut: '#f87171',
  skipped: '#64748b',
  interrupted: '#fbbf24',
  stopped: '#fbbf24',
}

function renderItem(item: ExecutionItem): string {
  const stepsHtml = item.steps
    .map(
      (step) => `
        <li style="color: ${step.status === 'passed' ? '#34d399' : '#f87171'};">
          ${step.status === 'passed' ? '✓' : '✗'} ${escapeHtml(step.title)}
          <span style="color:#64748b;font-size:12px;">(${formatDuration(step.durationMs)})</span>
        </li>`,
    )
    .join('')

  const screenshotsHtml = item.screenshots
    .map(
      (src) =>
        `<img src="${escapeHtml(src)}" alt="Failure screenshot" style="max-height:120px;margin:4px;border:1px solid #334155;border-radius:4px;" />`,
    )
    .join('')

  return `
    <div style="border:1px solid #1e293b;border-radius:6px;padding:16px;margin-bottom:16px;background:#0f172a;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-family:monospace;color:#e2e8f0;">${escapeHtml(item.fileName)}</span>
        <span style="color:${STATUS_COLOR[item.status]};font-weight:600;">${item.status}</span>
      </div>
      <p style="color:#64748b;font-size:12px;">Duration: ${formatDuration(item.durationMs)}</p>
      ${item.error ? `<p style="color:#f87171;font-size:13px;">${escapeHtml(item.error)}</p>` : ''}
      <ul style="list-style:none;padding:0;margin:8px 0;font-size:13px;">${stepsHtml}</ul>
      ${screenshotsHtml ? `<div>${screenshotsHtml}</div>` : ''}
    </div>`
}

export function buildHtmlReport(session: ExecutionSession): string {
  const summary = computeSummary(session)

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Execution Report - ${escapeHtml(session.id)}</title>
</head>
<body style="background:#020617;color:#e2e8f0;font-family:system-ui,sans-serif;margin:0;padding:24px;">
  <h1 style="font-size:20px;">Test Execution Report</h1>
  <p style="color:#64748b;font-size:13px;">
    Session ${escapeHtml(session.id)} · started ${escapeHtml(session.startedAt)} · status ${escapeHtml(session.status)}
  </p>
  <div style="display:flex;gap:16px;margin:16px 0;font-size:14px;">
    <span>Total: ${summary.total}</span>
    <span style="color:#34d399;">Passed: ${summary.passed}</span>
    <span style="color:#f87171;">Failed: ${summary.failed}</span>
    <span style="color:#f87171;">Timed out: ${summary.timedOut}</span>
    <span style="color:#fbbf24;">Interrupted: ${summary.interrupted}</span>
    <span style="color:#64748b;">Skipped: ${summary.skipped}</span>
    <span>Duration: ${formatDuration(summary.durationMs)}</span>
  </div>
  ${session.items.map(renderItem).join('')}
</body>
</html>`
}
