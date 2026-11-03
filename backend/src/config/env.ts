import 'dotenv/config'

function optional(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.length > 0 ? value : fallback
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '4000')),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),
  adbPath: optional('ADB_PATH', 'adb'),
  databasePath: optional('DATABASE_PATH', './data/app.db'),
  recordingsDir: optional('RECORDINGS_DIR', '../recordings'),
  generatedTestsDir: optional('GENERATED_TESTS_DIR', '../generated-tests'),
  reportsDir: optional('REPORTS_DIR', '../reports'),
  screenshotsDir: optional('SCREENSHOTS_DIR', '../screenshots'),
  uploadsDir: optional('UPLOADS_DIR', '../uploads'),
  logLevel: optional('LOG_LEVEL', 'info'),
  // Never logged or exposed to the client. Absent until the user supplies one via .env.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  // Configurable so users can trade off cost/quality without a code change.
  anthropicModel: optional('ANTHROPIC_MODEL', 'claude-opus-5'),
}

export type Env = typeof env
