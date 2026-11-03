import type { GeneratedScript, ScriptLanguage } from '../scriptgen/types.js'
import type { TestCase, TestStep } from './types.js'

// Only these forms are trusted enough to interpolate into a real script file -
// the AI's locatorExpression is an unverified guess (no live device to check
// it against), so anything that doesn't match this shape is dropped in favor
// of a TODO comment rather than risking malformed or unsafe generated code.
const SAFE_LOCATOR_PATTERN =
  /^get(?:ByTestId|ByLabel|ByText|ByRole|ByPlaceholder|ByType)\((?:'[^'\\]*'|"[^"\\]*")(?:,\s*\{[^{}]*\})?\)$/

function safeLocator(expression: string | undefined): string | undefined {
  if (!expression) return undefined
  const trimmed = expression.trim()
  return SAFE_LOCATOR_PATTERN.test(trimmed) ? trimmed : undefined
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'document-test'
}

function envVarNameFor(title: string): string {
  const name = title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `TEST_${name || 'FIELD'}`
}

interface RenderState {
  steps: string[]
  requiredEnvVars: Set<string>
}

function renderStepBody(step: TestStep, state: RenderState): string {
  const locator = safeLocator(step.locatorExpression)
  const noLocatorTodo = `// TODO: ${step.action} - AI could not confidently infer a locator; verify against the real app`

  switch (step.action) {
    case 'tap':
      return locator ? `await screen.${locator}.tap();` : noLocatorTodo
    case 'longPress':
      return locator ? `await screen.${locator}.longPress();` : noLocatorTodo
    case 'doubleTap':
      return locator ? `await screen.${locator}.doubleTap();` : noLocatorTodo
    case 'clear':
      return locator ? `await screen.${locator}.clear();` : noLocatorTodo
    case 'fill': {
      if (!locator) return noLocatorTodo
      if (step.isSensitive) {
        const envVar = envVarNameFor(step.title)
        state.requiredEnvVars.add(envVar)
        return `await screen.${locator}.fill(process.env.${envVar} ?? '');`
      }
      return `await screen.${locator}.fill(${JSON.stringify(step.value ?? '')});`
    }
    case 'swipe': {
      const direction = step.value || 'up'
      return locator
        ? `await screen.${locator}.swipe({ direction: ${JSON.stringify(direction)} });`
        : `await screen.swipe(${JSON.stringify(direction)});`
    }
    case 'back':
      return "await screen.pressButton('BACK');"
    case 'assertVisible':
      return locator
        ? `await expect(screen.${locator}).toBeVisible();`
        : `await expect(screen.getByText(${JSON.stringify(step.value ?? '')})).toBeVisible();`
    default:
      return `// TODO: unrecognized step action (${step.action satisfies never})`
  }
}

// Renders one reviewed, approved test case into a Mobilewright script. Unlike
// the recorded-flow generator, there is no live device or UI tree here - every
// locator is an AI guess from document text alone, so the header comment and
// per-step TODOs make that limitation explicit rather than implying certainty.
export function renderTestCase(testCase: TestCase, language: ScriptLanguage): GeneratedScript {
  const state: RenderState = { steps: [], requiredEnvVars: new Set() }

  for (const step of testCase.steps) {
    const body = renderStepBody(step, state)
    state.steps.push(`  await test.step(${JSON.stringify(step.title)}, async () => {\n    ${body}\n  });`)
  }
  if (state.steps.length === 0) state.steps.push('  // No steps were defined for this test case.')

  const code = [
    "import { test, expect } from '@mobilewright/test';",
    '',
    '// Generated from a document, not a real device recording - every locator below',
    '// is an AI best guess and MUST be verified against the real app before relying on it.',
    "test.use({ bundleId: 'REPLACE_WITH_YOUR_APP_PACKAGE' }); // TODO: set the real app package",
    '',
    `test(${JSON.stringify(testCase.title)}, async ({ screen }) => {`,
    ...state.steps,
    '});',
    '',
  ].join('\n')

  const extension = language === 'typescript' ? 'test.ts' : 'test.js'
  const fileName = `${slugify(testCase.title)}.${extension}`

  return { language, fileName, code, requiredEnvVars: [...state.requiredEnvVars] }
}
