import ExcelJS from 'exceljs'
import type { ExecutionSession } from '../execution/types.js'
import { computeSummary } from './summary.js'

export async function buildXlsxReport(session: ExecutionSession): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const summary = computeSummary(session)

  const summarySheet = workbook.addWorksheet('Summary')
  summarySheet.addRow(['Session ID', session.id])
  summarySheet.addRow(['Started At', session.startedAt])
  summarySheet.addRow(['Finished At', session.finishedAt ?? ''])
  summarySheet.addRow(['Status', session.status])
  summarySheet.addRow(['Total', summary.total])
  summarySheet.addRow(['Passed', summary.passed])
  summarySheet.addRow(['Failed', summary.failed])
  summarySheet.addRow(['Timed Out', summary.timedOut])
  summarySheet.addRow(['Interrupted', summary.interrupted])
  summarySheet.addRow(['Skipped', summary.skipped])
  summarySheet.addRow(['Stopped', summary.stopped])

  const itemsSheet = workbook.addWorksheet('Test Items')
  itemsSheet.addRow(['File', 'Language', 'Status', 'Duration (ms)', 'Error'])
  for (const item of session.items) {
    itemsSheet.addRow([item.fileName, item.language, item.status, item.durationMs ?? '', item.error ?? ''])
  }

  const stepsSheet = workbook.addWorksheet('Steps')
  stepsSheet.addRow(['File', 'Step', 'Status', 'Duration (ms)', 'Error'])
  for (const item of session.items) {
    for (const step of item.steps) {
      stepsSheet.addRow([item.fileName, step.title, step.status, step.durationMs, step.error ?? ''])
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
