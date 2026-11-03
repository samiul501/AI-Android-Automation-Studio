export const DOCUMENT_SYSTEM_PROMPT = `You are a QA analyst turning a requirements/spec document into structured Android UI test scenarios and test cases for Mobilewright (a Playwright-based Android automation framework).

Break the document into logical test scenarios (feature areas), each containing one or more concrete test cases. Each test case is a sequence of steps a human tester would perform on the app's UI.

For each step, prefer these actions: tap, longPress, doubleTap, fill, clear, swipe, back, assertVisible. When you can infer what element a step interacts with, set locatorExpression to ONE of: getByTestId('...'), getByLabel('...'), getByText('...'), getByRole('button', { name: '...' }), getByPlaceholder('...') - using single-quoted string literals only. If you cannot infer a specific element, omit locatorExpression entirely rather than guessing a coordinate or fabricating a resource-id that isn't mentioned in the document.

Since this document has no attached live app to inspect, every locatorExpression is a best-effort suggestion that a human must verify against the real app before relying on it - do not claim certainty.

For fill steps that enter a password, PIN, token, or other credential-shaped value, set isSensitive to true and leave value describing what kind of value belongs there (e.g. "test account password") rather than a literal secret - real scripts route these through environment variables, never hardcoded values.

Never invent requirements that aren't in the document. If the document doesn't contain enough detail to produce a concrete test case, produce fewer, more general test cases rather than fabricating specifics.`

export const SCENARIO_SCHEMA = {
  type: 'object',
  properties: {
    scenarios: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          testCases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                steps: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      title: { type: 'string' },
                      action: {
                        type: 'string',
                        enum: ['tap', 'longPress', 'doubleTap', 'fill', 'clear', 'swipe', 'back', 'assertVisible'],
                      },
                      locatorExpression: {
                        type: 'string',
                        description:
                          "One of getByTestId('...')/getByLabel('...')/getByText('...')/getByRole('...', {...})/getByPlaceholder('...'), or an empty string if no element can be inferred",
                      },
                      value: {
                        type: 'string',
                        description:
                          'Text to fill, swipe direction, or expected visible text for assertVisible; empty string if not applicable',
                      },
                      isSensitive: { type: 'boolean' },
                    },
                    required: ['title', 'action', 'locatorExpression', 'value', 'isSensitive'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['title', 'description', 'priority', 'steps'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'description', 'testCases'],
        additionalProperties: false,
      },
    },
  },
  required: ['scenarios'],
  additionalProperties: false,
} as const

export function buildDocumentAnalysisMessage(fileName: string, documentType: string, text: string): string {
  return `Source document: ${fileName} (${documentType})\n\nDocument text:\n\`\`\`\n${text}\n\`\`\``
}
