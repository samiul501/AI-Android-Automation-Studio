export function AdbSetupNotice() {
  return (
    <div className="border-b border-red-900/50 bg-red-950/40 px-6 py-3 text-sm text-red-200">
      <p className="font-semibold">ADB / Android SDK Platform-Tools is required.</p>
      <p className="mt-1 text-red-300/90">
        Install the standalone <span className="font-medium text-red-200">Android SDK Platform-Tools</span> package
        (Android Studio is not required) and make sure the{' '}
        <code className="rounded bg-red-900/50 px-1 py-0.5">adb</code> command is available from your terminal, then
        click <span className="font-medium">Check Device</span> again.
      </p>
    </div>
  )
}
