import { randomUUID } from 'node:crypto'
import { createStructuredMessage } from '../ai/client.js'
import { DOCUMENT_SYSTEM_PROMPT, SCENARIO_SCHEMA, buildDocumentAnalysisMessage } from './prompt.js'
import type { DocumentAnalysisResult, TestScenario } from './types.js'

// Assigns stable ids to AI-generated scenarios/cases so the frontend can
// address individual test cases (approve/edit/generate) without relying on
// array indices, which would shift if a case is later removed.
function withIds(result: DocumentAnalysisResult): TestScenario[] {
  return result.scenarios.map((scenario) => ({
    ...scenario,
    id: randomUUID(),
    testCases: scenario.testCases.map((testCase) => ({ ...testCase, id: randomUUID(), approved: false })),
  }))
}

export async function analyzeDocument(fileName: string, documentType: string, text: string): Promise<TestScenario[]> {
  const result = await createStructuredMessage<DocumentAnalysisResult>({
    system: DOCUMENT_SYSTEM_PROMPT,
    userMessage: buildDocumentAnalysisMessage(fileName, documentType, text),
    schema: SCENARIO_SCHEMA,
    maxTokens: 8192,
  })

  return withIds(result)
}
