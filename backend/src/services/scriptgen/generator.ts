import type { RecordedAction, RecordingSession } from '../recording/types.js'
import { detectNewlyVisibleText } from './assertions.js'
import { isSensitiveField, deriveEnvVarName } from './credentials.js'
import type { GeneratedScript, ScriptGenerationOptions } from './types.js'

const PACKAGE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/

// `apps foreground` output isn't a documented, stable format - it may be a
// bare package name or "package/activity". Only accept it if it actually
// looks like an Android package name; never fabricate one.
export function extractPackageName(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const candidate = raw.trim().split('/')[0]
  return PACKAGE_NAME_PATTERN.test(candidate) ? candidate : undefined
}

function findAppPackage(session: RecordingSession): string | undefined {
  for (const action of session.actions) {
    const found =
      extractPackageName(action.screenBefore?.foregroundApp) ?? extractPackageName(action.screenAfter?.foregroundApp)
    if (found) return found
  }
  return undefined
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'recording'
}

function defaultTestName(session: RecordingSession): string {
  return `Recorded flow - ${new Date(session.startedAt).toLocaleString()}`
}

interface CodegenState {
  steps: string[]
  requiredEnvVars: Set<string>
}

// Human-readable step title, e.g. "Tap \"Log in\"" - this becomes the
// test.step() label, which is exactly what the Execution Engine's live
// reporter surfaces as the current running step in the UI.
function describeStep(action: RecordedAction): string {
  const target = action.element?.text || action.element?.contentDescription || action.element?.resourceId

  switch (action.type) {
    case 'tap':
      return target ? `Tap "${target}"` : `Tap (${action.x}, ${action.y})`
    case 'long_press':
      return target ? `Long press "${target}"` : `Long press (${action.x}, ${action.y})`
    case 'double_tap':
      return target ? `Double tap "${target}"` : `Double tap (${action.x}, ${action.y})`
    case 'text_input':
      return target ? `Enter text into "${target}"` : 'Enter text'
    case 'clear_input':
      return target ? `Clear "${target}"` : 'Clear field'
    case 'swipe':
      return `Swipe ${action.direction ?? ''}`.trim()
    case 'scroll':
      return `Scroll ${action.direction ?? ''}`.trim()
    case 'back':
      return 'Go back'
    case 'app_launch':
      return 'Launch app'
    default:
      return 'Gesture'
  }
}

function renderActionBody(action: RecordedAction, state: CodegenState): string {
  const locatorExpr = action.locator?.best.expression
  // `screen.getByX(...)` returns a chainable Locator, but the coordinates
  // strategy's expression is already a terminal `tap(x, y)` call on Screen
  // itself - chaining `.tap()`/`.fill()` etc. onto it would call a method on
  // `undefined` and crash at runtime. Screen exposes coordinate-based
  // tap/doubleTap/longPress directly, so those three route through it
  // instead of chaining. fill/clear have no coordinate-only equivalent
  // (Mobilewright must resolve a Locator to focus the field first).
  const isCoordinateOnly = action.locator?.best.strategy === 'coordinates'
  const x = Math.round(action.x ?? 0)
  const y = Math.round(action.y ?? 0)

  switch (action.type) {
    case 'tap':
      if (isCoordinateOnly) return `await screen.tap(${x}, ${y});`
      return locatorExpr
        ? `await screen.${locatorExpr}.tap();`
        : '// TODO: tap - no locator was captured for this element'
    case 'long_press':
      if (isCoordinateOnly) return `await screen.longPress(${x}, ${y});`
      return locatorExpr
        ? `await screen.${locatorExpr}.longPress();`
        : '// TODO: long press - no locator was captured for this element'
    case 'double_tap':
      if (isCoordinateOnly) return `await screen.doubleTap(${x}, ${y});`
      return locatorExpr
        ? `await screen.${locatorExpr}.doubleTap();`
        : '// TODO: double tap - no locator was captured for this element'
    case 'text_input': {
      if (isCoordinateOnly)
        return '// TODO: enter text - only raw coordinates were captured for this field; a stable locator is required to fill text reliably'
      if (!locatorExpr) return '// TODO: enter text - no locator was captured for this field'
      if (isSensitiveField(action.element, action.text)) {
        const envVar = deriveEnvVarName(action.element)
        state.requiredEnvVars.add(envVar)
        return `await screen.${locatorExpr}.fill(process.env.${envVar} ?? '');`
      }
      return `await screen.${locatorExpr}.fill(${JSON.stringify(action.text ?? '')});`
    }
    case 'clear_input':
      if (isCoordinateOnly)
        return '// TODO: clear field - only raw coordinates were captured for this element; a stable locator is required to clear reliably'
      return locatorExpr ? `await screen.${locatorExpr}.clear();` : '// TODO: clear field - no locator was captured'
    case 'swipe':
    case 'scroll': {
      const direction = action.direction ?? 'up'
      const hasStableTarget = locatorExpr && !isCoordinateOnly
      return hasStableTarget
        ? `await screen.${locatorExpr}.swipe({ direction: '${direction}' });`
        : `await screen.swipe('${direction}');`
    }
    case 'back':
      return "await screen.pressButton('BACK');"
    default:
      return `// TODO: unrecognized gesture (${action.type})`
  }
}

function pushStep(state: CodegenState, title: string, body: string): void {
  state.steps.push(`  await test.step(${JSON.stringify(title)}, async () => {\n    ${body}\n  });`)
}

function renderAction(action: RecordedAction, state: CodegenState): void {
  // Launching the app is handled via test.use({ bundleId }), not an inline step.
  if (action.type === 'app_launch') return

  pushStep(state, describeStep(action), renderActionBody(action, state))

  for (const text of detectNewlyVisibleText(action.screenBefore, action.screenAfter)) {
    pushStep(
      state,
      `Verify "${text}" is visible`,
      `await expect(screen.getByText(${JSON.stringify(text)})).toBeVisible();`,
    )
  }
}

// Generates a clean Mobilewright test from a completed recording. Every
// action (and every generated assertion) is wrapped in its own test.step() so
// the Execution Engine's reporter can surface real step-by-step progress, not
// just a single pass/fail for the whole test. The TS and JS outputs share
// identical code - the recorded flow body needs no explicit type annotations,
// so there's nothing genuinely TypeScript-specific to add.
export function generateScript(session: RecordingSession, options: ScriptGenerationOptions): GeneratedScript {
  const testName = options.testName ?? defaultTestName(session)
  const appPackage = findAppPackage(session)

  const state: CodegenState = { steps: [], requiredEnvVars: new Set() }
  for (const action of session.actions) renderAction(action, state)
  if (state.steps.length === 0) state.steps.push('  // No actions were recorded in this session.')

  const bundleIdLine = appPackage
    ? `test.use({ bundleId: '${appPackage}' });`
    : "test.use({ bundleId: 'REPLACE_WITH_YOUR_APP_PACKAGE' }); // TODO: the app package could not be detected during recording"

  const code = [
    "import { test, expect } from '@mobilewright/test';",
    '',
    bundleIdLine,
    '',
    `test(${JSON.stringify(testName)}, async ({ screen }) => {`,
    ...state.steps,
    '});',
    '',
  ].join('\n')

  const extension = options.language === 'typescript' ? 'test.ts' : 'test.js'
  const fileName = `${slugify(testName)}.${extension}`

  return { language: options.language, fileName, code, requiredEnvVars: [...state.requiredEnvVars] }
}
