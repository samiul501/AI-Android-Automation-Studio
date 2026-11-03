import { createStructuredMessage, AiNotConfiguredError, AiRefusedError } from './client.js'
import { SYSTEM_PROMPT, ANALYSIS_SCHEMA, buildUserMessage } from './prompt.js'
import type { FailureContext, FailureAnalysis } from './types.js'

export { AiNotConfiguredError, AiRefusedError }

export async function analyzeFailure(context: FailureContext): Promise<FailureAnalysis> {
  return createStructuredMessage<FailureAnalysis>({
    system: SYSTEM_PROMPT,
    userMessage: buildUserMessage(context),
    schema: ANALYSIS_SCHEMA,
  })
}
