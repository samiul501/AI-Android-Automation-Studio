import PDFDocument from 'pdfkit'
import type { ExecutionSession } from '../execution/types.js'
import { computeSummary } from './summary.js'

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '-'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export async function buildPdfReport(session: ExecutionSession): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40 })
  const chunks: Buffer[] = []

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const summary = computeSummary(session)

  doc.fontSize(18).text('Test Execution Report', { align: 'left' })
  doc.moveDown(0.5)
  doc
    .fontSize(10)
    .fillColor('#475569')
    .text(`Session ${session.id} · started ${session.startedAt} · status ${session.status}`)
  doc.moveDown(1)

  doc
    .fontSize(11)
    .fillColor('#0f172a')
    .text(
      `Total: ${summary.total}   Passed: ${summary.passed}   Failed: ${summary.failed}   ` +
        `Timed out: ${summary.timedOut}   Interrupted: ${summary.interrupted}   Skipped: ${summary.skipped}   ` +
        `Duration: ${formatDuration(summary.durationMs)}`,
    )
  doc.moveDown(1)

  for (const item of session.items) {
    doc.fontSize(13).fillColor('#0f172a').text(`${item.fileName} - ${item.status}`)
    doc
      .fontSize(9)
      .fillColor('#64748b')
      .text(`Duration: ${formatDuration(item.durationMs)}`)
    if (item.error) doc.fontSize(9).fillColor('#b91c1c').text(item.error)

    for (const step of item.steps) {
      const mark = step.status === 'passed' ? '✓' : '✗'
      doc
        .fontSize(9)
        .fillColor(step.status === 'passed' ? '#047857' : '#b91c1c')
        .text(`  ${mark} ${step.title} (${formatDuration(step.durationMs)})`)
    }
    doc.moveDown(0.75)
  }

  doc.end()
  return done
}
