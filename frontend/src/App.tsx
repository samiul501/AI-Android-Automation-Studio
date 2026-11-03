import { useCallback, useEffect, useRef, useState } from 'react'
import { Header } from './components/layout/Header'
import { LeftPanel } from './components/layout/LeftPanel'
import { CenterWorkspace } from './components/layout/CenterWorkspace'
import { RightPanel } from './components/layout/RightPanel'
import { BottomSummary } from './components/layout/BottomSummary'
import { AdbSetupNotice } from './components/common/AdbSetupNotice'
import { disconnectDevice, fetchDeviceStatus } from './api/device'
import { resetSystem } from './api/system'
import { fetchMobilewrightReadiness } from './api/automation'
import { fetchActiveRecording, listRecordings, startRecording, stopRecording } from './api/recording'
import { fetchScript, generateScript, listScripts, saveScript } from './api/scripts'
import { fetchActiveExecution, runExecution, stopExecution } from './api/execution'
import { analyzeFailure, applyAiFix } from './api/ai'
import {
  analyzeDocument,
  generateDocumentScript,
  listDocuments,
  updateScenarios,
  uploadDocument,
} from './api/documents'
import { listReports } from './api/reports'
import { useRecordingSocket } from './hooks/useRecordingSocket'
import { useExecutionSocket } from './hooks/useExecutionSocket'
import { INITIAL_DEVICE_STATUS } from './types/device'
import type { MobilewrightReadiness } from './types/automation'
import type { RecordingSession } from './types/recording'
import type { ScriptContent, ScriptFileSummary, ScriptLanguage } from './types/scripts'
import type { ExecutionSession } from './types/execution'
import type { DocumentSession } from './types/document'
import type { AnalysisState } from './components/execution/ExecutionView'

function countSteps(code: string): number {
  return (code.match(/await test\.step\(/g) ?? []).length
}

const AUTO_CHECK_INTERVAL_MS = 8000

function App() {
  const [deviceStatus, setDeviceStatus] = useState(INITIAL_DEVICE_STATUS)
  const [mobilewrightReadiness, setMobilewrightReadiness] = useState<MobilewrightReadiness | null>(null)
  const [isCheckingDevice, setIsCheckingDevice] = useState(false)
  const [recordingSession, setRecordingSession] = useState<RecordingSession | null>(null)
  const [recordings, setRecordings] = useState<RecordingSession[]>([])
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [isRecordingActionPending, setIsRecordingActionPending] = useState(false)
  const isCheckingRef = useRef(false)
  const hasAutoSelectedScriptRef = useRef(false)

  const [scripts, setScripts] = useState<ScriptFileSummary[]>([])
  const [selectedScript, setSelectedScript] = useState<ScriptContent | null>(null)
  const [editedCode, setEditedCode] = useState('')
  const [isSavingScript, setIsSavingScript] = useState(false)
  const [scriptError, setScriptError] = useState<string | null>(null)
  const [generatingRecordingId, setGeneratingRecordingId] = useState<string | null>(null)

  const [executionSession, setExecutionSession] = useState<ExecutionSession | null>(null)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [isExecutionActionPending, setIsExecutionActionPending] = useState(false)
  const [stepTotals, setStepTotals] = useState<Record<string, number>>({})
  const [analyses, setAnalyses] = useState<Record<number, AnalysisState>>({})
  const [applyingFixIndex, setApplyingFixIndex] = useState<number | null>(null)
  const lastRunScripts = useRef<{ language: ScriptLanguage; fileName: string }[]>([])

  const [documents, setDocuments] = useState<DocumentSession[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [isUploadingDocument, setIsUploadingDocument] = useState(false)
  const [documentUploadError, setDocumentUploadError] = useState<string | null>(null)
  const [isAnalyzingDocument, setIsAnalyzingDocument] = useState(false)
  const [generatingDocumentScriptKey, setGeneratingDocumentScriptKey] = useState<string | null>(null)

  const [reports, setReports] = useState<ExecutionSession[]>([])

  const [isDisconnectingDevice, setIsDisconnectingDevice] = useState(false)
  const [isResettingSystem, setIsResettingSystem] = useState(false)
  const [systemMessage, setSystemMessage] = useState<{ type: 'info' | 'error'; text: string } | null>(null)

  const checkDevice = useCallback(async () => {
    if (isCheckingRef.current) return
    isCheckingRef.current = true
    setIsCheckingDevice(true)
    try {
      const status = await fetchDeviceStatus()
      setDeviceStatus(status)
    } catch {
      setDeviceStatus((previous) => ({
        ...previous,
        error: 'Unable to reach the backend to check device status.',
      }))
    } finally {
      isCheckingRef.current = false
      setIsCheckingDevice(false)
    }
  }, [])

  // Mobilewright/mobilecli readiness only changes when the user installs
  // something on the host machine, so it's checked once on load and again on
  // manual "Check Device" clicks - not on the fast automatic device poll.
  const checkMobilewright = useCallback(async () => {
    try {
      setMobilewrightReadiness(await fetchMobilewrightReadiness())
    } catch {
      // Leave the previous readiness state in place; the ADB device check
      // already surfaces backend-unreachable errors.
    }
  }, [])

  const refreshRecordings = useCallback(async () => {
    try {
      setRecordings(await listRecordings())
    } catch {
      // Non-critical: the left panel just keeps showing the previous list.
    }
  }, [])

  const refreshScripts = useCallback(async () => {
    try {
      setScripts(await listScripts())
    } catch {
      // Non-critical: the left panel just keeps showing the previous list.
    }
  }, [])

  const refreshDocuments = useCallback(async () => {
    try {
      setDocuments(await listDocuments())
    } catch {
      // Non-critical: the left panel just keeps showing the previous list.
    }
  }, [])

  const refreshReports = useCallback(async () => {
    try {
      setReports(await listReports())
    } catch {
      // Non-critical: the left panel just keeps showing the previous list.
    }
  }, [])

  useEffect(() => {
    checkDevice()
    checkMobilewright()
    refreshRecordings()
    refreshScripts()
    refreshDocuments()
    refreshReports()
    fetchActiveRecording()
      .then((session) => session && setRecordingSession(session))
      .catch(() => undefined)
    fetchActiveExecution()
      .then((session) => session && setExecutionSession(session))
      .catch(() => undefined)
    const interval = setInterval(checkDevice, AUTO_CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [checkDevice, checkMobilewright, refreshRecordings, refreshScripts, refreshDocuments, refreshReports])

  useRecordingSocket({
    onStarted: (session) => setRecordingSession(session),
    onAction: (sessionId, action) =>
      setRecordingSession((previous) =>
        previous && previous.id === sessionId ? { ...previous, actions: [...previous.actions, action] } : previous,
      ),
    onStopped: (session) => {
      setRecordingSession(session)
      refreshRecordings()
    },
  })

  useExecutionSocket({
    onStarted: (session) => setExecutionSession(session),
    onItemUpdate: (sessionId, index, item) =>
      setExecutionSession((previous) => {
        if (!previous || previous.id !== sessionId) return previous
        const items = [...previous.items]
        items[index] = item
        return { ...previous, items }
      }),
    onFinished: (session) => {
      setExecutionSession(session)
      refreshReports()
    },
  })

  const handleCheckDevice = useCallback(() => {
    checkDevice()
    checkMobilewright()
  }, [checkDevice, checkMobilewright])

  const handleDisconnectDevice = useCallback(async () => {
    setIsDisconnectingDevice(true)
    setSystemMessage(null)
    try {
      const result = await disconnectDevice(deviceStatus.primaryDevice?.serial)
      setDeviceStatus(result.status)
      const message =
        result.stderr.trim() ||
        result.stdout.trim() ||
        (result.status.connectionState === 'connected'
          ? 'adb reported no error, but the device is still connected (expected for USB-attached devices).'
          : 'Device disconnected.')
      setSystemMessage({ type: result.status.connectionState === 'connected' ? 'error' : 'info', text: message })
    } catch (error) {
      setSystemMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to disconnect device' })
    } finally {
      setIsDisconnectingDevice(false)
    }
  }, [deviceStatus.primaryDevice])

  const handleResetSystem = useCallback(async () => {
    const confirmed = window.confirm(
      'Reset session? This permanently deletes every saved recording, generated script, and report, and stops ' +
        'any recording or execution in progress. This cannot be undone.',
    )
    if (!confirmed) return

    setIsResettingSystem(true)
    setSystemMessage(null)
    try {
      await resetSystem()
      setRecordingSession(null)
      setRecordings([])
      setRecordingError(null)
      setScripts([])
      setSelectedScript(null)
      setEditedCode('')
      setScriptError(null)
      setExecutionSession(null)
      setExecutionError(null)
      setStepTotals({})
      setAnalyses({})
      setApplyingFixIndex(null)
      lastRunScripts.current = []
      setReports([])
      hasAutoSelectedScriptRef.current = false
      setSystemMessage({ type: 'info', text: 'Session reset. Ready for a new recording.' })
    } catch (error) {
      setSystemMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to reset system' })
    } finally {
      setIsResettingSystem(false)
    }
  }, [])

  const handleStartRecording = useCallback(async () => {
    setRecordingError(null)
    setIsRecordingActionPending(true)
    try {
      setRecordingSession(await startRecording())
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : 'Failed to start recording')
    } finally {
      setIsRecordingActionPending(false)
    }
  }, [])

  const handleStopRecording = useCallback(async () => {
    setIsRecordingActionPending(true)
    try {
      setRecordingSession(await stopRecording())
      await refreshRecordings()
    } catch (error) {
      setRecordingError(error instanceof Error ? error.message : 'Failed to stop recording')
    } finally {
      setIsRecordingActionPending(false)
    }
  }, [refreshRecordings])

  const handleSelectScript = useCallback(async (language: ScriptLanguage, fileName: string) => {
    setScriptError(null)
    try {
      const script = await fetchScript(language, fileName)
      setSelectedScript(script)
      setEditedCode(script.code)
    } catch (error) {
      setScriptError(error instanceof Error ? error.message : 'Failed to load script')
    }
  }, [])

  // Scripts generated in a prior session are loaded into the sidebar on
  // mount, but nothing is selected yet - without this, the CODE tab shows
  // "No script loaded" even though a script already exists.
  useEffect(() => {
    if (hasAutoSelectedScriptRef.current || scripts.length === 0) return
    hasAutoSelectedScriptRef.current = true
    const latest = [...scripts].sort(
      (a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime(),
    )[0]
    handleSelectScript(latest.language, latest.fileName)
  }, [scripts, handleSelectScript])

  const handleGenerateScript = useCallback(
    async (recordingId: string, language: ScriptLanguage) => {
      setScriptError(null)
      setGeneratingRecordingId(recordingId)
      try {
        const script = await generateScript(recordingId, language)
        await refreshScripts()
        setSelectedScript(script)
        setEditedCode(script.code)
      } catch (error) {
        setScriptError(error instanceof Error ? error.message : 'Failed to generate script')
      } finally {
        setGeneratingRecordingId(null)
      }
    },
    [refreshScripts],
  )

  const handleSaveScript = useCallback(async () => {
    if (!selectedScript) return
    setIsSavingScript(true)
    setScriptError(null)
    try {
      const saved = await saveScript(selectedScript.language, selectedScript.fileName, editedCode)
      setSelectedScript(saved)
      await refreshScripts()
    } catch (error) {
      setScriptError(error instanceof Error ? error.message : 'Failed to save script')
    } finally {
      setIsSavingScript(false)
    }
  }, [selectedScript, editedCode, refreshScripts])

  // Counting `test.step()` calls in each script's own source gives a real
  // step total to show progress against, rather than a fabricated percentage.
  const loadStepTotals = useCallback(async (refs: { language: ScriptLanguage; fileName: string }[]) => {
    const entries = await Promise.all(
      refs.map(async (ref) => {
        try {
          const script = await fetchScript(ref.language, ref.fileName)
          return [`${ref.language}:${ref.fileName}`, countSteps(script.code)] as const
        } catch {
          return null
        }
      }),
    )
    setStepTotals((previous) => {
      const next = { ...previous }
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1]
      }
      return next
    })
  }, [])

  const handleRunScripts = useCallback(
    async (refs: { language: ScriptLanguage; fileName: string }[]) => {
      setExecutionError(null)
      setIsExecutionActionPending(true)
      setAnalyses({}) // indices belong to the session about to start, not the previous one
      lastRunScripts.current = refs
      try {
        void loadStepTotals(refs)
        setExecutionSession(await runExecution(refs))
      } catch (error) {
        setExecutionError(error instanceof Error ? error.message : 'Failed to start execution')
      } finally {
        setIsExecutionActionPending(false)
      }
    },
    [loadStepTotals],
  )

  const handleRunScript = useCallback(
    (language: ScriptLanguage, fileName: string) => handleRunScripts([{ language, fileName }]),
    [handleRunScripts],
  )

  const handleRunAll = useCallback(
    () => handleRunScripts(scripts.map((script) => ({ language: script.language, fileName: script.fileName }))),
    [handleRunScripts, scripts],
  )

  const handleRetryExecution = useCallback(() => {
    if (lastRunScripts.current.length > 0) handleRunScripts(lastRunScripts.current)
  }, [handleRunScripts])

  const handleStopExecution = useCallback(async () => {
    setIsExecutionActionPending(true)
    try {
      setExecutionSession(await stopExecution())
    } catch (error) {
      setExecutionError(error instanceof Error ? error.message : 'Failed to stop execution')
    } finally {
      setIsExecutionActionPending(false)
    }
  }, [])

  const handleAnalyzeFailure = useCallback(
    async (index: number) => {
      if (!executionSession) return
      setAnalyses((previous) => ({ ...previous, [index]: { status: 'loading' } }))
      try {
        const analysis = await analyzeFailure(executionSession.id, index)
        setAnalyses((previous) => ({ ...previous, [index]: { status: 'done', analysis } }))
      } catch (error) {
        setAnalyses((previous) => ({
          ...previous,
          [index]: { status: 'error', message: error instanceof Error ? error.message : 'Failed to analyze failure' },
        }))
      }
    },
    [executionSession],
  )

  const handleApplyFix = useCallback(
    async (index: number, code: string) => {
      const item = executionSession?.items[index]
      if (!item) return
      setApplyingFixIndex(index)
      try {
        await applyAiFix(item.language, item.fileName, code)
        await refreshScripts()
        if (selectedScript && selectedScript.language === item.language && selectedScript.fileName === item.fileName) {
          setSelectedScript({ ...selectedScript, code })
          setEditedCode(code)
        }
      } catch (error) {
        setAnalyses((previous) => {
          const current = previous[index]
          if (current?.status !== 'done') return previous
          return {
            ...previous,
            [index]: { status: 'error', message: error instanceof Error ? error.message : 'Failed to apply fix' },
          }
        })
      } finally {
        setApplyingFixIndex(null)
      }
    },
    [executionSession, selectedScript, refreshScripts],
  )

  const handleRunItemAgain = useCallback(
    (index: number) => {
      const item = executionSession?.items[index]
      if (item) handleRunScripts([{ language: item.language, fileName: item.fileName }])
    },
    [executionSession, handleRunScripts],
  )

  const handleUploadDocument = useCallback(async (file: File) => {
    setDocumentUploadError(null)
    setIsUploadingDocument(true)
    try {
      const session = await uploadDocument(file)
      setDocuments((previous) => [session, ...previous])
      setSelectedDocumentId(session.id)
    } catch (error) {
      setDocumentUploadError(error instanceof Error ? error.message : 'Failed to upload document')
    } finally {
      setIsUploadingDocument(false)
    }
  }, [])

  const handleSelectDocument = useCallback((id: string) => {
    setSelectedDocumentId(id)
  }, [])

  const handleAnalyzeDocument = useCallback(async () => {
    if (!selectedDocumentId) return
    setIsAnalyzingDocument(true)
    try {
      const session = await analyzeDocument(selectedDocumentId)
      setDocuments((previous) => previous.map((doc) => (doc.id === session.id ? session : doc)))
    } catch {
      // The session was already persisted server-side with status
      // "analysis-failed" and analysisError set - refetch the list to reflect it.
      await refreshDocuments()
    } finally {
      setIsAnalyzingDocument(false)
    }
  }, [selectedDocumentId, refreshDocuments])

  const handleToggleTestCaseApproved = useCallback(
    async (testCaseId: string, approved: boolean) => {
      const current = documents.find((doc) => doc.id === selectedDocumentId)
      if (!current) return
      const scenarios = current.scenarios.map((scenario) => ({
        ...scenario,
        testCases: scenario.testCases.map((testCase) =>
          testCase.id === testCaseId ? { ...testCase, approved } : testCase,
        ),
      }))
      // Optimistic update so the checkbox responds immediately; reconciled
      // with the server's response once the PUT resolves.
      setDocuments((previous) => previous.map((doc) => (doc.id === current.id ? { ...doc, scenarios } : doc)))
      try {
        const session = await updateScenarios(current.id, scenarios)
        setDocuments((previous) => previous.map((doc) => (doc.id === session.id ? session : doc)))
      } catch {
        await refreshDocuments()
      }
    },
    [documents, selectedDocumentId, refreshDocuments],
  )

  const handleGenerateDocumentScript = useCallback(
    async (testCaseId: string, language: ScriptLanguage) => {
      if (!selectedDocumentId) return
      const key = `${testCaseId}:${language}`
      setGeneratingDocumentScriptKey(key)
      try {
        await generateDocumentScript(selectedDocumentId, testCaseId, language)
        await Promise.all([refreshDocuments(), refreshScripts()])
      } catch (error) {
        setDocumentUploadError(error instanceof Error ? error.message : 'Failed to generate script')
      } finally {
        setGeneratingDocumentScriptKey(null)
      }
    },
    [selectedDocumentId, refreshDocuments, refreshScripts],
  )

  const isRecording = recordingSession?.status === 'recording'
  const isExecutionRunning = executionSession?.status === 'running'
  const hasUnsavedChanges = selectedScript !== null && editedCode !== selectedScript.code
  const selectedDocument = documents.find((doc) => doc.id === selectedDocumentId) ?? null

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <Header
        deviceState={deviceStatus.connectionState}
        isCheckingDevice={isCheckingDevice}
        isRecording={isRecording}
        isRecordingActionPending={isRecordingActionPending}
        isDisconnectingDevice={isDisconnectingDevice}
        isResettingSystem={isResettingSystem}
        onCheckDevice={handleCheckDevice}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onDisconnectDevice={handleDisconnectDevice}
        onResetSystem={handleResetSystem}
      />

      {!deviceStatus.adbAvailable && <AdbSetupNotice />}
      {systemMessage && (
        <p
          className={`border-b px-6 py-2 text-sm ${
            systemMessage.type === 'error'
              ? 'border-red-900/50 bg-red-950/40 text-red-300'
              : 'border-emerald-900/50 bg-emerald-950/30 text-emerald-300'
          }`}
        >
          {systemMessage.text}
        </p>
      )}

      <div className="flex flex-1 overflow-hidden">
        <LeftPanel
          recordings={recordings}
          scripts={scripts}
          selectedScript={selectedScript}
          generatingRecordingId={generatingRecordingId}
          isExecutionRunning={isExecutionRunning}
          onGenerateScript={handleGenerateScript}
          onSelectScript={handleSelectScript}
          onRunScript={handleRunScript}
          onRunAll={handleRunAll}
          documents={documents}
          selectedDocumentId={selectedDocumentId}
          isUploadingDocument={isUploadingDocument}
          documentUploadError={documentUploadError}
          onUploadDocument={handleUploadDocument}
          onSelectDocument={handleSelectDocument}
          reports={reports}
        />
        <CenterWorkspace
          selectedScript={selectedScript}
          editedCode={editedCode}
          hasUnsavedChanges={hasUnsavedChanges}
          isSaving={isSavingScript}
          saveError={scriptError}
          onCodeChange={setEditedCode}
          onSave={handleSaveScript}
          executionSession={executionSession}
          stepTotals={stepTotals}
          isExecutionRunning={isExecutionRunning}
          isExecutionActionPending={isExecutionActionPending}
          executionError={executionError}
          onRunSelected={() => selectedScript && handleRunScript(selectedScript.language, selectedScript.fileName)}
          onStopExecution={handleStopExecution}
          onRetryExecution={handleRetryExecution}
          analyses={analyses}
          applyingFixIndex={applyingFixIndex}
          onAnalyzeFailure={handleAnalyzeFailure}
          onApplyFix={handleApplyFix}
          onRunItemAgain={handleRunItemAgain}
          selectedDocument={selectedDocument}
          isAnalyzingDocument={isAnalyzingDocument}
          generatingDocumentScriptKey={generatingDocumentScriptKey}
          onAnalyzeDocument={handleAnalyzeDocument}
          onToggleTestCaseApproved={handleToggleTestCaseApproved}
          onGenerateDocumentScript={handleGenerateDocumentScript}
        />
        <RightPanel
          status={deviceStatus}
          mobilewrightReadiness={mobilewrightReadiness}
          recordingSession={recordingSession}
          recordingError={recordingError}
          executionSession={executionSession}
        />
      </div>

      <BottomSummary executionSession={executionSession} />
    </div>
  )
}

export default App
