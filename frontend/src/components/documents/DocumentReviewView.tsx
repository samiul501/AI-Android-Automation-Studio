import type { DocumentSession, TestStep } from '../../types/document'

const STATUS_LABEL: Record<DocumentSession['status'], string> = {
  uploaded: 'Uploaded',
  analyzing: 'Analyzing…',
  reviewing: 'Ready for review',
  'analysis-failed': 'Analysis failed',
}

const STATUS_COLOR: Record<DocumentSession['status'], string> = {
  uploaded: 'text-slate-400',
  analyzing: 'text-sky-400',
  reviewing: 'text-emerald-400',
  'analysis-failed': 'text-red-400',
}

function describeStep(step: TestStep): string {
  const target = step.locatorExpression || (step.value ? `"${step.value}"` : '')
  return target ? `${step.action} → ${target}` : step.action
}

interface DocumentReviewViewProps {
  session: DocumentSession | null
  isAnalyzing: boolean
  generatingKey: string | null
  onAnalyze: () => void
  onToggleApproved: (testCaseId: string, approved: boolean) => void
  onGenerateScript: (testCaseId: string, language: 'typescript' | 'javascript') => void
}

export function DocumentReviewView({
  session,
  isAnalyzing,
  generatingKey,
  onAnalyze,
  onToggleApproved,
  onGenerateScript,
}: DocumentReviewViewProps) {
  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="text-center text-slate-600">
          <p className="text-sm">No document selected</p>
          <p className="mt-1 text-xs">Upload a requirements document from the left panel to get started</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-mono text-sm text-slate-200">{session.originalFileName}</h2>
          <p className={`text-xs ${STATUS_COLOR[session.status]}`}>{STATUS_LABEL[session.status]}</p>
        </div>
        <button
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        >
          {isAnalyzing ? 'Analyzing…' : session.scenarios.length > 0 ? 'Re-analyze with AI' : 'Analyze with AI'}
        </button>
      </div>

      {session.status === 'analysis-failed' && session.analysisError && (
        <p className="mb-4 rounded border border-red-900/50 bg-red-950/40 p-2 text-xs text-red-300">
          {session.analysisError}
        </p>
      )}

      <details className="mb-4 rounded border border-slate-800 bg-slate-900/60 p-2 text-xs">
        <summary className="cursor-pointer text-slate-400">
          Extracted text preview {session.truncated && '(truncated)'}
        </summary>
        <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-slate-500">{session.textPreview}</pre>
      </details>

      {session.scenarios.length === 0 ? (
        <p className="text-sm text-slate-600 italic">
          No test scenarios yet - click "Analyze with AI" to generate them from this document.
        </p>
      ) : (
        <div className="space-y-4">
          {session.scenarios.map((scenario) => (
            <div key={scenario.id} className="rounded border border-slate-800 bg-slate-900/40 p-3">
              <h3 className="text-sm font-semibold text-slate-200">{scenario.title}</h3>
              <p className="mb-2 text-xs text-slate-500">{scenario.description}</p>

              <div className="space-y-2">
                {scenario.testCases.map((testCase) => {
                  const generatedTs = session.generatedScripts.find(
                    (g) => g.testCaseId === testCase.id && g.language === 'typescript',
                  )
                  const generatedJs = session.generatedScripts.find(
                    (g) => g.testCaseId === testCase.id && g.language === 'javascript',
                  )
                  return (
                    <div key={testCase.id} className="rounded border border-slate-800 bg-slate-950/60 p-2.5">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={testCase.approved}
                          onChange={(e) => onToggleApproved(testCase.id, e.target.checked)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-200">{testCase.title}</p>
                          <p className="text-xs text-slate-500">
                            {testCase.description} · priority: {testCase.priority}
                          </p>
                        </div>
                      </label>

                      <ul className="mt-2 ml-6 space-y-0.5">
                        {testCase.steps.map((step, i) => (
                          <li key={i} className="font-mono text-xs text-slate-500">
                            {i + 1}. {step.title} <span className="text-slate-600">({describeStep(step)})</span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-2 ml-6 flex items-center gap-2">
                        <button
                          onClick={() => onGenerateScript(testCase.id, 'typescript')}
                          disabled={!testCase.approved || generatingKey === `${testCase.id}:typescript`}
                          title={testCase.approved ? undefined : 'Approve this test case before generating a script'}
                          className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
                        >
                          {generatedTs ? 'Regenerate TS' : 'Generate TS'}
                        </button>
                        <button
                          onClick={() => onGenerateScript(testCase.id, 'javascript')}
                          disabled={!testCase.approved || generatingKey === `${testCase.id}:javascript`}
                          title={testCase.approved ? undefined : 'Approve this test case before generating a script'}
                          className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
                        >
                          {generatedJs ? 'Regenerate JS' : 'Generate JS'}
                        </button>
                        {(generatedTs || generatedJs) && (
                          <span className="text-xs text-emerald-400">
                            Generated: {[generatedTs?.fileName, generatedJs?.fileName].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
