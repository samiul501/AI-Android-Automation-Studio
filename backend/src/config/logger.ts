type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

function currentLevel(): number {
  const level = (process.env.LOG_LEVEL ?? 'info') as Level
  return LEVELS[level] ?? LEVELS.info
}

function log(level: Level, message: string, meta?: Record<string, unknown>) {
  if (LEVELS[level] < currentLevel()) return
  const entry = { timestamp: new Date().toISOString(), level, message, ...meta }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => log('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => log('error', message, meta),
}
