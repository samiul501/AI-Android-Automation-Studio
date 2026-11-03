import { useState } from 'react'
import Editor from '@monaco-editor/react'
import type { ScriptContent } from '../../types/scripts'
import type { ExecutionSession } from '../../types/execution'
import type { DocumentSession } from '../../types/document'
import { ExecutionView, type AnalysisState } from '../execution/ExecutionView'
import { DocumentReviewView } from '../documents/DocumentReviewView'
import { LiveInspectorView } from '../inspector/LiveInspectorView'

type WorkspaceMode = 'code' | 'execution' | 'documents' | 'inspector'

interface CenterWorkspaceProps {
  selectedScript: ScriptContent | null
  editedCode: string
  hasUnsavedChanges: boolean
  isSaving: boolean
  saveError: string | null
  onCodeChange: (code: string) => void
  onSave: () => void
  executionSession: ExecutionSession | null
  stepTotals: Record<string, number>
  isExecutionRunning: boolean
  isExecutionActionPending: boolean
  executionError: string | null
  onRunSelected: () => void
  onStopExecution: () => void
  onRetryExecution: () => void
  analyses: Record<number, AnalysisState>
  applyingFixIndex: number | null
  onAnalyzeFailure: (index: number) => void
  onApplyFix: (index: number, code: string) => void
  onRunItemAgain: (index: number) => void
  selectedDocument: DocumentSession | null
  isAnalyzingDocument: boolean
  generatingDocumentScriptKey: string | null
  onAnalyzeDocument: () => void
  onToggleTestCaseApproved: (testCaseId: string, approved: boolean) => void
  onGenerateDocumentScript: (testCaseId: string, language: 'typescript' | 'javascript') => void
}

export function CenterWorkspace({
  selectedScript,
  editedCode,
  hasUnsavedChanges,
  isSaving,
  saveError,
  onCodeChange,
  onSave,
  executionSession,
  stepTotals,
  isExecutionRunning,
  isExecutionActionPending,
  executionError,
  onRunSelected,
  onStopExecution,
  onRetryExecution,
  analyses,
  applyingFixIndex,
  onAnalyzeFailure,
  onApplyFix,
  onRunItemAgain,
  selectedDocument,
  isAnalyzingDocument,
  generatingDocumentScriptKey,
  onAnalyzeDocument,
  onToggleTestCaseApproved,
  onGenerateDocumentScript,
}: CenterWorkspaceProps) {
  const [mode, setMode] = useState<WorkspaceMode>('code')

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-slate-950">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
        <div className="flex items-center gap-2">
          {(['code', 'execution', 'documents', 'inspector'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === m ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              {m === 'code' ? 'CODE' : m === 'execution' ? 'EXECUTION' : m === 'documents' ? 'DOCUMENTS' : 'INSPECTOR'}
            </button>
          ))}
        </div>

        {mode === 'code' && selectedScript && (
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-slate-500">
              {selectedScript.fileName}
              {hasUnsavedChanges && <span className="ml-1 text-amber-400">●</span>}
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(editedCode)}
              className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Copy
            </button>
            <button
              onClick={onSave}
              disabled={!hasUnsavedChanges || isSaving}
              className="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={onRunSelected}
              disabled={isExecutionRunning || isExecutionActionPending}
              className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
            >
              Run Test
            </button>
          </div>
        )}

        {mode === 'execution' && (
          <div className="flex items-center gap-2">
            <button
              onClick={onStopExecution}
              disabled={!isExecutionRunning || isExecutionActionPending}
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
            >
              Stop
            </button>
            <button
              onClick={onRetryExecution}
              disabled={isExecutionRunning || isExecutionActionPending || !executionSession}
              className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {saveError && (
        <p className="border-b border-red-900/50 bg-red-950/40 px-4 py-2 text-sm text-red-300">{saveError}</p>
      )}
      {mode === 'execution' && executionError && (
        <p className="border-b border-red-900/50 bg-red-950/40 px-4 py-2 text-sm text-red-300">{executionError}</p>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {mode === 'code' ? (
          selectedScript ? (
            <Editor
              height="100%"
              language={selectedScript.language === 'javascript' ? 'javascript' : 'typescript'}
              value={editedCode}
              onChange={(value: string | undefined) => onCodeChange(value ?? '')}
              theme="vs-dark"
              options={{ fontSize: 13, minimap: { enabled: false }, automaticLayout: true, tabSize: 2 }}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="text-center text-slate-600">
                <p className="text-sm">No script loaded</p>
                <p className="mt-1 text-xs">
                  Record a session and generate a script, or select one from the left panel
                </p>
              </div>
            </div>
          )
        ) : mode === 'execution' ? (
          <ExecutionView
            session={executionSession}
            stepTotals={stepTotals}
            analyses={analyses}
            applyingFixIndex={applyingFixIndex}
            onAnalyzeFailure={onAnalyzeFailure}
            onApplyFix={onApplyFix}
            onRunAgain={onRunItemAgain}
          />
        ) : mode === 'documents' ? (
          <DocumentReviewView
            session={selectedDocument}
            isAnalyzing={isAnalyzingDocument}
            generatingKey={generatingDocumentScriptKey}
            onAnalyze={onAnalyzeDocument}
            onToggleApproved={onToggleTestCaseApproved}
            onGenerateScript={onGenerateDocumentScript}
          />
        ) : (
          <LiveInspectorView />
        )}
      </div>
    </main>
  )
}
