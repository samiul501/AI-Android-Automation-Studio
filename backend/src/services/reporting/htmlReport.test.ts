import { describe, it, expect } from 'vitest'
import { buildHtmlReport } from './htmlReport.js'
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

describe('buildHtmlReport', () => {
  it('includes the session id and summary counts', () => {
    const html = buildHtmlReport(
      makeSession({
        items: [
          { language: 'typescript', fileName: 'login.test.ts', status: 'passed', steps: [], screenshots: [], logs: [] },
        ],
      }),
    )
    expect(html).toContain('s1')
    expect(html).toContain('login.test.ts')
    expect(html).toContain('Passed: 1')
  })

  it('escapes HTML-significant characters in file names and errors', () => {
    const html = buildHtmlReport(
      makeSession({
        items: [
          {
            language: 'typescript',
            fileName: '<script>alert(1)</script>.test.ts',
            status: 'failed',
            error: '<img src=x onerror=alert(1)>',
            steps: [],
            screenshots: [],
            logs: [],
          },
        ],
      }),
    )
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders each step with its pass/fail marker', () => {
    const html = buildHtmlReport(
      makeSession({
        items: [
          {
            language: 'typescript',
            fileName: 'a.test.ts',
            status: 'failed',
            steps: [
              { title: 'Tap login', status: 'passed', durationMs: 100 },
              { title: 'Verify welcome', status: 'failed', durationMs: 50, error: 'not found' },
            ],
            screenshots: [],
            logs: [],
          },
        ],
      }),
    )
    expect(html).toContain('Tap login')
    expect(html).toContain('Verify welcome')
    expect(html).toContain('✓')
    expect(html).toContain('✗')
  })
})
