import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../config/env.js'

export class AiNotConfiguredError extends Error {
  constructor(feature = 'this AI feature') {
    super(`ANTHROPIC_API_KEY is not set. Add it to .env to enable ${feature}.`)
  }
}

export class AiRefusedError extends Error {
  constructor(category: string | null | undefined) {
    super(`AI analysis was declined by the safety classifier${category ? ` (category: ${category})` : ''}.`)
  }
}

let client: Anthropic | undefined

// The SDK reads no credentials from the environment implicitly here - the key
// is passed explicitly from our own config layer so it's never hardcoded and
// always sourced from .env (see CLAUDE.md's "never hardcode credentials" rule).
function getClient(): Anthropic {
  if (!env.anthropicApiKey) throw new AiNotConfiguredError()
  client ??= new Anthropic({ apiKey: env.anthropicApiKey })
  return client
}

export interface StructuredMessageParams {
  system: string
  userMessage: string
  schema: Record<string, unknown>
  maxTokens?: number
}

// Shared by every AI feature (failure analysis, document-to-test) that needs a
// guaranteed-shape JSON response rather than free-form text.
export async function createStructuredMessage<T>(params: StructuredMessageParams): Promise<T> {
  const anthropic = getClient()

  const response = await anthropic.messages.create({
    model: env.anthropicModel,
    max_tokens: params.maxTokens ?? 4096,
    system: params.system,
    messages: [{ role: 'user', content: params.userMessage }],
    output_config: { format: { type: 'json_schema', schema: params.schema } },
  })

  if (response.stop_reason === 'refusal') {
    throw new AiRefusedError(response.stop_details?.type === 'refusal' ? response.stop_details.category : undefined)
  }

  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')
  if (!textBlock) {
    throw new Error('AI response did not contain any analysis text')
  }

  return JSON.parse(textBlock.text) as T
}
