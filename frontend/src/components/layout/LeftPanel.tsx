import { useRef } from 'react'
import type { RecordingSession } from '../../types/recording'
import type { ScriptFileSummary, ScriptLanguage } from '../../types/scripts'
import type { DocumentSession } from '../../types/document'
import type { ExecutionSession } from '../../types/execution'
import { reportDownloadUrl, type ReportFormat } from '../../api/reports'

const ACCEPTED_DOCUMENT_TYPES = '.pdf,.docx,.xlsx,.csv,.txt,.md,.json'
const REPORT_FORMATS: ReportFormat[] = ['html', 'pdf', 'xlsx', 'json', 'zip']

const DOCUMENT_STATUS_DOT: Record<DocumentSession['status'], string> = {
  uploaded: 'bg-slate-500',
  analyzing: 'bg-sky-400',
  reviewing: 'bg-emerald-400',
  'analysis-failed': 'bg-red-400',
}

const EXECUTION_STATUS_COLOR: Record<ExecutionSession['status'], string> = {
  running: 'text-sky-400',
  completed: 'text-emerald-400',
  stopped: 'text-amber-400',
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString()
}

interface LeftPanelProps {
  recordings: RecordingSession[]
  scripts: ScriptFileSummary[]
  selectedScript: { language: ScriptLanguage; fileName: string } | null
  generatingRecordingId: string | null
  isExecutionRunning: boolean
  onGenerateScript: (recordingId: string, language: ScriptLanguage) => void
  onSelectScript: (language: ScriptLanguage, fileName: string) => void
  onRunScript: (language: ScriptLanguage, fileName: string) => void
  onRunAll: () => void
  documents: DocumentSession[]
  selectedDocumentId: string | null
  isUploadingDocument: boolean
  documentUploadError: string | null
  onUploadDocument: (file: File) => void
  onSelectDocument: (id: string) => void
  reports: ExecutionSession[]
}

export function LeftPanel({
  recordings,
  scripts,
  selectedScript,
  generatingRecordingId,
  isExecutionRunning,
  onGenerateScript,
  onSelectScript,
  onRunScript,
  onRunAll,
  documents,
  selectedDocumentId,
  isUploadingDocument,
  documentUploadError,
  onUploadDocument,
  onSelectDocument,
  reports,
}: LeftPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recordings</h2>
        {recordings.length === 0 ? (
          <p className="text-sm text-slate-600 italic">No recordings captured yet</p>
        ) : (
          <ul className="space-y-3">
            {recordings.map((recording) => (
              <li key={recording.id} className="text-sm text-slate-300">
                <p className="truncate">{formatTimestamp(recording.startedAt)}</p>
                <p className="text-xs text-slate-500">
                  {recording.actions.length} action{recording.actions.length === 1 ? '' : 's'} ·{' '}
                  {recording.deviceSerial}
                </p>
                <div className="mt-1 flex gap-1.5">
                  <button
                    onClick={() => onGenerateScript(recording.id, 'typescript')}
                    disabled={generatingRecordingId === recording.id}
                    className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
                  >
                    Generate TS
                  </button>
                  <button
                    onClick={() => onGenerateScript(recording.id, 'javascript')}
                    disabled={generatingRecordingId === recording.id}
                    className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
                  >
                    Generate JS
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-b border-slate-800 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Generated Scripts</h2>
          {scripts.length > 0 && (
            <button
              onClick={onRunAll}
              disabled={isExecutionRunning}
              className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
            >
              Run All
            </button>
          )}
        </div>
        {scripts.length === 0 ? (
          <p className="text-sm text-slate-600 italic">No scripts generated yet</p>
        ) : (
          <ul className="space-y-1">
            {scripts.map((script) => {
              const isSelected =
                selectedScript?.language === script.language && selectedScript?.fileName === script.fileName
              return (
                <li key={`${script.language}/${script.fileName}`} className="flex items-center gap-1">
                  <button
                    onClick={() => onSelectScript(script.language, script.fileName)}
                    className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm ${
                      isSelected ? 'bg-sky-600/20 text-sky-300' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {script.fileName}
                  </button>
                  <button
                    onClick={() => onRunScript(script.language, script.fileName)}
                    disabled={isExecutionRunning}
                    title="Run this script"
                    className="shrink-0 rounded border border-slate-700 px-1.5 py-0.5 text-xs text-emerald-400 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
                  >
                    ▶
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-b border-slate-800 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documents</h2>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingDocument}
            className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:text-slate-600"
          >
            {isUploadingDocument ? 'Uploading…' : 'Upload'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_DOCUMENT_TYPES}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onUploadDocument(file)
              e.target.value = ''
            }}
          />
        </div>
        {documentUploadError && <p className="mb-2 text-xs text-red-400">{documentUploadError}</p>}
        {documents.length === 0 ? (
          <p className="text-sm text-slate-600 italic">No documents uploaded yet</p>
        ) : (
          <ul className="space-y-1">
            {documents.map((doc) => (
              <li key={doc.id}>
                <button
                  onClick={() => onSelectDocument(doc.id)}
                  className={`flex w-full min-w-0 items-center gap-1.5 rounded px-2 py-1 text-left text-sm ${
                    selectedDocumentId === doc.id ? 'bg-sky-600/20 text-sky-300' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOCUMENT_STATUS_DOT[doc.status]}`} />
                  <span className="min-w-0 flex-1 truncate">{doc.originalFileName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-b border-slate-800 p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Reports</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-slate-600 italic">No reports available yet</p>
        ) : (
          <ul className="space-y-2">
            {reports.map((report) => (
              <li key={report.id} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="truncate text-slate-300">{formatTimestamp(report.startedAt)}</span>
                  <span className={`text-xs ${EXECUTION_STATUS_COLOR[report.status]}`}>{report.status}</span>
                </div>
                <p className="mb-1 text-xs text-slate-500">
                  {report.items.length} script{report.items.length === 1 ? '' : 's'}
                </p>
                <div className="flex flex-wrap gap-1">
                  {REPORT_FORMATS.map((format) => (
                    <a
                      key={format}
                      href={reportDownloadUrl(report.id, format)}
                      className="rounded border border-slate-700 px-1.5 py-0.5 text-xs uppercase text-slate-400 hover:bg-slate-800"
                    >
                      {format}
                    </a>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
