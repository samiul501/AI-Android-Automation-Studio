import { describe, it, expect } from 'vitest'
import { computeSummary } from './summary.js'
import type { ExecutionSession } from '../execution/types.js'

function makeSession(overrides: Partial<ExecutionSession> = {}): ExecutionSession {
  return {
    id: 's1',
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'completed',
    items: [],
    currentIndex: 0,
    ...overrides,
  }
}

describe('computeSummary', () => {
  it('counts items by status', () => {
    const session = makeSession({
      items: [
        { language: 'typescript', fileName: 'a.test.ts', status: 'passed', steps: [], screenshots: [], logs: [] },
        { language: 'typescript', fileName: 'b.test.ts', status: 'failed', steps: [], screenshots: [], logs: [] },
        { language: 'typescript', fileName: 'c.test.ts', status: 'passed', steps: [], screenshots: [], logs: [] },
      ],
    })
    const summary = computeSummary(session)
    expect(summary.total).toBe(3)
    expect(summary.passed).toBe(2)
    expect(summary.failed).toBe(1)
    expect(summary.timedOut).toBe(0)
  })

  it('computes duration from started/finished timestamps when finished', () => {
    const session = makeSession({
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:05.000Z',
    })
    expect(computeSummary(session).durationMs).toBe(5000)
  })

  it('leaves duration undefined for a session that has not finished', () => {
    const session = makeSession({ finishedAt: undefined })
    expect(computeSummary(session).durationMs).toBeUndefined()
  })

  it('returns all-zero counts for an empty session', () => {
    const summary = computeSummary(makeSession())
    expect(summary.total).toBe(0)
    expect(summary.passed).toBe(0)
    expect(summary.failed).toBe(0)
  })
})
