import { describe, it, expect } from 'vitest'
import { buildPdfReport } from './pdfReport.js'
import type { ExecutionSession } from '../execution/types.js'

describe('buildPdfReport', () => {
  it('produces a real, non-empty PDF buffer with a valid PDF header', async () => {
    const session: ExecutionSession = {
      id: 's1',
      startedAt: '2026-01-01T00:00:00.000Z',
      status: 'completed',
      currentIndex: 0,
      items: [
        {
          language: 'typescript',
          fileName: 'login.test.ts',
          status: 'failed',
          error: 'Element not found',
          steps: [{ title: 'Tap login', status: 'failed', durationMs: 100, error: 'timeout' }],
          screenshots: [],
          logs: [],
        },
      ],
    }

    const buffer = await buildPdfReport(session)
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-')
  })
})
