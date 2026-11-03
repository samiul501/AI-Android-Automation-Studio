import ExcelJS from 'exceljs'
import { describe, it, expect } from 'vitest'
import { buildXlsxReport } from './xlsxReport.js'
import type { ExecutionSession } from '../execution/types.js'

describe('buildXlsxReport', () => {
  it('produces a real workbook readable back by ExcelJS with the expected sheets and rows', async () => {
    const session: ExecutionSession = {
      id: 's1',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:05.000Z',
      status: 'completed',
      currentIndex: 1,
      items: [
        {
          language: 'typescript',
          fileName: 'login.test.ts',
          status: 'passed',
          durationMs: 5000,
          steps: [{ title: 'Tap login', status: 'passed', durationMs: 100 }],
          screenshots: [],
          logs: [],
        },
      ],
    }

    const buffer = await buildXlsxReport(session)
    expect(buffer.length).toBeGreaterThan(0)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as never)

    const sheetNames = workbook.worksheets.map((s) => s.name)
    expect(sheetNames).toEqual(['Summary', 'Test Items', 'Steps'])

    const itemsSheet = workbook.getWorksheet('Test Items')
    expect(itemsSheet?.getRow(2).getCell(1).value).toBe('login.test.ts')

    const stepsSheet = workbook.getWorksheet('Steps')
    expect(stepsSheet?.getRow(2).getCell(2).value).toBe('Tap login')
  })
})
