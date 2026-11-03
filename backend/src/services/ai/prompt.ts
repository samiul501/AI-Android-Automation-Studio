import type { FailureContext } from './types.js'

export const SYSTEM_PROMPT = `You are an expert mobile test automation engineer analyzing a failed Mobilewright test (a Playwright-based Android automation framework). Given the failing step, error message, device info, recent logs, and the full script source, explain the likely root cause and propose a concrete fix.

Prefer semantic-locator explanations (element not found, changed resource-id, timing/race conditions) over speculative causes. If you suggest a code change, return the ENTIRE corrected script, not a diff or snippet. Never suggest hardcoding credentials - route any sensitive value through process.env.*. If the failure looks environmental (device disconnected, app not installed, ADB unavailable) rather than a script defect, say so plainly and set suggestedCodeChange to an empty string.`

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One or two sentence explanation of the likely root cause' },
    likelyCauses: { type: 'array', items: { type: 'string' }, description: 'Ranked list of plausible root causes' },
    suggestedFix: {
      type: 'string',
      description: "Human-readable description of how to fix the script, or why it isn't a script problem",
    },
    suggestedCodeChange: {
      type: 'string',
      description:
        'The full corrected script source implementing the fix, or an empty string if no code change is warranted',
    },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['summary', 'likelyCauses', 'suggestedFix', 'suggestedCodeChange', 'confidence'],
  additionalProperties: false,
} as const

function formatDeviceInfo(device: FailureContext['deviceInfo']): string | undefined {
  if (!device) return undefined
  const parts = [
    device.model,
    device.androidVersion && `Android ${device.androidVersion}`,
    device.apiLevel !== undefined && `API ${device.apiLevel}`,
  ]
  const joined = parts.filter(Boolean).join(', ')
  return joined.length > 0 ? `Device: ${joined}` : undefined
}

const MAX_LOG_LINES = 50

export function buildUserMessage(context: FailureContext): string {
  const lines: (string | undefined)[] = [
    `Script: ${context.scriptFileName}`,
    context.failedStepTitle ? `Failed step: ${context.failedStepTitle}` : undefined,
    `Error: ${context.errorMessage}`,
    formatDeviceInfo(context.deviceInfo),
    context.recentLogs && context.recentLogs.length > 0
      ? `Recent logs:\n${context.recentLogs.slice(-MAX_LOG_LINES).join('\n')}`
      : undefined,
    `\nFull script source:\n\`\`\`\n${context.scriptCode}\n\`\`\``,
  ]
  return lines.filter((line): line is string => line !== undefined).join('\n')
}
