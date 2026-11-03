# Implementation phases

| Phase | Description                     | Status      |
| ----- | -------------------------------- | ----------- |
| 1     | Project initialization           | Done        |
| 2     | ADB and Device Manager           | Done        |
| 3     | Mobilewright integration         | Done        |
| 4     | Recording Engine                 | Done        |
| 5     | Smart Locator Engine              | Done        |
| 6     | Script Generator                 | Done        |
| 7     | Execution Engine                 | Done        |
| 8     | AI Failure Analysis              | Done        |
| 9     | Document-to-Test                 | Done        |
| 10    | Reporting                        | Done        |
| 11    | Final UI/UX                      | Done        |
| 12    | Final QA                         | Done        |

## Phase 1 — Project initialization

Delivered:

- npm-workspaces monorepo (`frontend`, `backend`)
- Frontend: Vite + React 19 + TypeScript + Tailwind CSS v4, dashboard shell matching the
  final layout (header, three-column workspace, bottom summary bar) with all
  device/recording/execution state left honest ("unknown" / empty states) — no fake
  connection status or mock results
- Backend: Express + TypeScript, structured JSON logger, `/api/health` route, WebSocket
  server stub at `/ws`, environment-based config (`backend/src/config/env.ts`)
- ESLint (backend) + Prettier (shared) + oxlint (frontend, Vite default)
- Vitest + Supertest smoke test for the health route
- `.env.example`, `.gitignore`, runtime directory scaffolding with `.gitkeep`

Explicitly deferred to later phases:

- Monaco Editor integration (Phase 6)
- Any real ADB / device communication (Phase 2)
- Any Mobilewright execution (Phase 3, 7)
- AI service calls (Phase 8, 9)
- SQLite persistence layer (introduced when Phase 4 needs to store recordings)

## Phase 2 — ADB and Device Manager

Delivered:

- `backend/src/services/adb.ts` — safe `adb` invocation via `execFile` (never a shell),
  with `AdbNotFoundError` for the missing-binary case
- `backend/src/services/deviceManager.ts` — parses `adb devices -l` and
  `adb -s <serial> shell getprop` to determine connection state (`connected` /
  `unauthorized` / `disconnected` / `adb-missing`) and device details (model,
  manufacturer, Android version, API level); unit-tested against real adb output formats
- `GET /api/device/status` REST endpoint (`backend/src/routes/device.ts`)
- Frontend: `src/api/device.ts` client, `App.tsx` checks on mount and polls every 8s (plus
  manual "Check Device"), `RightPanel` shows live device info, `AdbSetupNotice` banner
  renders the required "ADB / Android SDK Platform-Tools is required." message when ADB
  isn't found
- Verified against the real local `adb` binary: correctly reports `disconnected` with no
  device attached, and `adb-missing` when pointed at a nonexistent binary. No physical
  device was attached during this phase — the `connected`/`unauthorized` states are
  implemented and unit-tested against real `adb` output formats, but end-to-end
  verification with a physical device (with USB debugging authorized) is still
  outstanding and should be done before relying on this in production use.

## Phase 3 — Mobilewright integration

Delivered:

- Installed `mobilewright` + `@mobilewright/test` (real npm packages — a Playwright-style
  mobile automation framework built on `mobilecli`, which itself drives ADB for Android)
- Root `mobilewright.config.ts` (`platform: 'android'`, `testDir: ./generated-tests/typescript`,
  `autoAppLaunch: false` since no target app is configured yet)
- `generated-tests/typescript/device-connectivity.test.ts` — a baseline smoke test with no
  dependency on any specific app, proving the Mobilewright → mobilecli → ADB → physical
  device pipeline
- `backend/src/services/mobilewrightCli.ts` — spawns the installed CLI directly via
  `node <resolved cli.js>` (avoids relying on `.cmd`/`.bin` wrapper scripts cross-platform)
- `backend/src/services/mobilewrightDoctor.ts` — runs `mobilewright doctor --json` and
  derives a curated readiness signal from just `mobilecli` + `adb`. Mobilewright's doctor
  also checks Android Studio / ANDROID_HOME / the emulator / JDK, all of which are for
  local app builds or emulation — this platform intentionally does not require them (see
  the "never make Android Studio mandatory" rule in CLAUDE.md), so they're surfaced for
  visibility but excluded from the ready/not-ready determination
- `GET /api/automation/mobilewright-status` + a new "Automation Engine" section in the
  frontend's `RightPanel`, checked once on load and on manual "Check Device" clicks

Verified against the real local environment: `mobilewright doctor --json` genuinely
reports `mobilecli: ok` and `adb: ok` (both real, not mocked), and `npx mobilewright test`
against the smoke test genuinely attempts to connect through the real pipeline — it timed
out waiting for a device, which is the **correct, honest** result since no physical
Android device is attached to this development machine. End-to-end execution against an
actual physical device (with USB debugging authorized) is still unverified and should be
the first thing checked once a phone is plugged in.

## Phase 4 — Recording Engine

Mobilewright/mobilecli only expose automation *control* (tap, swipe, dump UI) — there is
no built-in "record what a human just did" primitive. This phase builds that from
scratch on top of raw Android input events, layered with mobilecli's UI dump for element
correlation:

- `backend/src/services/recording/touchEventParser.ts` — parses `adb shell getevent -lt`
  output (the standard Linux evdev / Android toolbox text format)
- `backend/src/services/recording/gestureDetector.ts` — stateful classifier that turns a
  raw touch-event stream into tap / long-press / swipe gestures, handling both the
  multitouch ("Type B") and single-touch ("Type A") evdev protocols, plus `KEY_BACK`
  detection for devices with a physical/virtual back button
- `backend/src/services/recording/deviceInputGeometry.ts` — parses `adb shell getevent -pl`
  to learn the touchscreen's raw coordinate range and scales it to screen pixels
- `backend/src/services/recording/uiTree.ts` — generic, alias-tolerant accessibility-tree
  helpers (`findElementAtPoint`, `extractElementInfo`, `detectTextChanges`) that don't
  assume one exact JSON shape from `mobilecli dump ui`, since that isn't a documented
  contract
- `backend/src/services/recording/session.ts` — dependency-injected orchestrator turning
  gestures + before/after UI snapshots into `RecordedAction`s (tap, long_press, swipe,
  scroll, back, text_input, clear_input); text entry is inferred by diffing editable
  fields across snapshots, since soft-keyboard keystrokes aren't independently observable
- `backend/src/services/recording/liveCapture.ts` + `manager.ts` — the real ADB/mobilecli
  wiring and session lifecycle/persistence (`recordings/<id>.json`), broadcasting
  `recording:started` / `recording:action` / `recording:stopped` over the existing
  WebSocket channel
- `POST /api/recording/start`, `POST /api/recording/stop`, `GET /api/recording`,
  `GET /api/recording/:id`, `GET /api/recording/active`
- Frontend: Start/Stop Recording buttons now call the real API; `RightPanel` shows a live
  action feed; `LeftPanel` lists saved recordings

**What's genuinely verified vs. not:** the parsing, gesture classification, coordinate
scaling, tree-matching, and session-sequencing logic (49 backend tests) are all covered
against realistic fixtures for the documented evdev/getevent format and synthetic
accessibility trees — including two real bugs the tests caught before ever touching a
device (BTN_TOUCH arriving before its position report; floating-point duration noise).
The `adb shell getevent` capture and `mobilecli dump ui` calls themselves are real,
non-mocked I/O, but **have not been exercised against a physical device** — none is
attached to this machine. The very first thing to check once a phone is plugged in:
start a recording, tap around a real app, and confirm the action feed reflects real taps
with correct element info.

## Phase 5 — Smart Locator Engine

Delivered:

- `backend/src/services/locator/roleMap.ts` — mirrors Mobilewright's own Android
  role-mapping table (Button→button, EditText→textfield, etc.) so generated locators use
  the same `getByRole()` semantics Mobilewright resolves at run time
- `backend/src/services/locator/locatorEngine.ts` — `rankLocators()` generates one
  candidate per available signal (resource-id → `getByTestId`, content-desc →
  `getByLabel`, role+name → `getByRole`, text → `getByText`, hint → `getByPlaceholder`,
  class name → `getByType`, structural path → XPath, raw point → `tap(x, y)`), scores each
  by priority tier then penalizes it if the same signal matches more than one element on
  the current screen (real uniqueness checking against the full snapshot, not a guess),
  and sorts by confidence. XPath is only generated when nothing accessibility-based
  exists at all; coordinates are always present as the guaranteed last-resort alternative
- Wired into `recording/session.ts`: every tap/long-press/swipe now gets a `locator`
  suggestion computed at capture time (while the full UI tree is still in memory — the
  persisted `RecordedAction` stores the ranked result, not the bulky raw tree)
- Frontend: the live action feed in `RightPanel` shows each action's best locator
  expression and confidence percentage inline

Verified with 10 new unit tests against realistic multi-element trees, including real
edge cases: a resource-id that's unique vs. one with duplicates, two identical "Welcome"
text labels correctly penalizing both the text and role candidates, single-quote
escaping so generated expressions stay syntactically valid, and the placeholder/hint
fallback for an EditText with no visible text or label. This logic is fully
device-independent (it operates on the UI tree structure, not on hardware), so it's
verified as thoroughly as it can be without a physical phone — no caveat here unlike
Phases 2-4.

## Phase 6 — Script Generator

Delivered:

- `backend/src/services/scriptgen/generator.ts` — turns a completed `RecordingSession`
  into a clean Mobilewright test: each action's already-ranked `locator.best.expression`
  becomes the call target (`screen.getByTestId(...).tap()`, `.fill(...)`,
  `.swipe({ direction })`, `screen.pressButton('BACK')`, etc.), with a TODO comment
  fallback if an action somehow has no locator. Also auto-detects the app's package name
  from the foreground-app snapshots captured during recording and sets
  `test.use({ bundleId })`, with a clear TODO placeholder when it can't be determined
  (never fabricates a package name)
- `backend/src/services/scriptgen/assertions.ts` — smart assertion generation: diffs each
  action's before/after visible-text snapshots (captured live during recording - see the
  `visibleTexts` addition to `ScreenState`) and emits `expect(screen.getByText(...)).
  toBeVisible()` for content that newly appeared, capped and prioritizing longer/more
  specific strings over noise
- `backend/src/services/scriptgen/credentials.ts` — routes password-like fields (flagged
  by UI attribute, resource-id/label/hint naming, or an email-shaped captured value)
  through `process.env.TEST_<FIELD>` instead of ever hardcoding the literal value;
  ordinary text (e.g. a search query) is still written as a literal, since it's just test
  data, not a credential
- `backend/src/services/scriptgen/fileStore.ts` — safe list/read/write under
  `generated-tests/{typescript,javascript}`, with filename validation that rejects path
  traversal
- `POST /api/scripts/generate`, `GET /api/scripts`, `GET/PUT /api/scripts/:language/:fileName`
- Frontend: real Monaco Editor in the central workspace (self-hosted, not the
  CDN-loaded default - see the "Monaco + Vite/Rolldown" note below), wired to load/edit/
  save generated scripts; `LeftPanel` lists real generated scripts and adds "Generate
  TS"/"Generate JS" buttons per recording

**Monaco + Vite/Rolldown note:** this Vite version (8.x) uses the new Rolldown bundler,
which fails to resolve monaco-editor's worker files via the usual `?worker` query-suffix
import. Worked around by using Vite's alternate `new URL('...', import.meta.url)` +
native `Worker` syntax instead (`frontend/src/monacoSetup.ts`), confirmed via `vite
build` actually emitting the `ts.worker`/`json.worker`/`css.worker`/`html.worker` chunks
in `dist/assets`. Also caught and fixed a real `npm audit` finding along the way:
monaco-editor pins a vulnerable `dompurify@3.4.8`; added an npm `overrides` entry to
force `dompurify@^3.4.13` without downgrading monaco-editor.

Verified: full round-trip tested end-to-end against a synthetic recording (generate →
list → read → edit → save, including a rejected path-traversal attempt), and confirmed
the actual generated code - password masked via `process.env.TEST_PASSWORD`, bundleId
correctly auto-detected, real locator expressions, and correct `expect(...).toBeVisible()`
assertions for newly-appeared text. 101 backend tests total (41 new this phase). The dev
server was restarted and rebuilt cleanly with the Monaco integration in place; genuine
in-browser confirmation (opening the app and visually confirming the editor renders with
no console errors) has **not** been done, since no browser/screenshot tool is available
in this environment - worth a quick manual check next time the app is opened.

## Phase 7 — Execution Engine

Mobilewright's CLI gives pass/fail for a whole test, but the spec needs real step-by-step
progress (✓/⏳/○ per step). Playwright (which Mobilewright's runner is built on) supports
custom reporters with per-step hooks, which is what makes this possible:

- Phase 6's generator now wraps every action + assertion in `test.step('label', ...)`
  (previously a flat sequence) - required for step-level events to exist at all
- `backend/src/services/execution/liveReporter.ts` - a standalone Playwright `Reporter`
  (loaded by Playwright directly from source, independent of the backend's own build) that
  emits `test_begin`/`step_begin`/`step_end`/`test_end`/`run_end` as marker-prefixed JSON
  lines on stdout
- `backend/src/services/execution/runner.ts` - spawns `mobilewright test <filter>
  --reporter <liveReporter>` and streams parsed events + raw log lines
- `backend/src/services/execution/queue.ts` - a dependency-injected `ExecutionQueue` that
  turns a sequence of scripts + reporter events into `ExecutionItem` state (steps, current
  step, status, screenshots, logs), runs scripts strictly one at a time (only one physical
  device), and supports stopping mid-run (skips the rest of the queue)
- `backend/src/services/execution/manager.ts` - real wiring: persists each session to
  `reports/executions/<id>.json`, copies failure screenshots (captured automatically by
  Mobilewright's `screen` fixture) into `screenshots/<id>/<index>/`, served via a new
  `/screenshots` static route
- `POST /api/execution/run` (accepts an array of scripts - covers both "run selected" and
  "run all"), `POST /api/execution/stop`, `GET /api/execution`, `GET /api/execution/:id`,
  `GET /api/execution/active`
- Frontend: a live `ExecutionView` in the central workspace's EXECUTION tab showing each
  script's step checklist, current step, duration, and a real progress percentage (the
  total step count comes from counting `test.step(` calls in the script's own source, not
  a fabricated number); Run/Stop/Retry controls, a per-script ▶ button and "Run All" in
  the left panel

**Two real bugs found and fixed by testing this against the actual (deviceless)
environment, not assumed to work:**
1. Mobilewright treats the CLI's file argument as a *regex filter* matched against paths
   relative to the project root - an absolute path silently matches zero tests ("No tests
   found"), even though the file genuinely exists.
2. On Windows, `path.relative()` returns backslash-separated paths, and backslash is
   itself a regex escape character (e.g. a literal `\t` becomes a tab) - this broke the
   filter match differently than the absolute-path bug, and needed a second fix (forward
   slashes) after the first one was already in place.

Both were caught by actually running executions end-to-end (confirmed via a live
WebSocket listener) rather than trusting the code after it type-checked and passed unit
tests - a good reminder that the untested I/O edges are exactly where real bugs hide.
After both fixes, a real run against this deviceless machine correctly reports
`status: "timedOut"` with the real 20-second device-setup error message, streamed live
over WebSocket and persisted to `reports/executions/`. Running an actual *passing* test
with real steps and a real screenshot-on-failure still requires a physical device to
verify - that remains the next thing to check once one is plugged in.

## Phase 8 — AI Failure Analysis

Wires a real Claude API call into the failure path, so a failed/timed-out/interrupted
execution item can be explained and (optionally, only on explicit user action) fixed:

- `backend/src/config/env.ts` — added `anthropicModel` (defaults to `claude-opus-5`,
  overridable via `ANTHROPIC_MODEL`) alongside the existing `anthropicApiKey`
- `backend/src/services/ai/types.ts` — `FailureContext` (script name/code, failed step,
  error, optional device info, recent logs) and `FailureAnalysis` (summary, ranked
  likely causes, human-readable fix description, full suggested script replacement,
  confidence) contracts
- `backend/src/services/ai/prompt.ts` — pure, unit-testable prompt construction: a system
  prompt instructing Claude to prefer semantic-locator explanations over speculative
  ones, never suggest hardcoded credentials, and say plainly when a failure looks
  environmental rather than a script defect; a JSON schema (`additionalProperties:
  false`) for structured output; `buildUserMessage()` assembles script/step/error/device/
  logs, capping recent logs to the last 50 lines
- `backend/src/services/ai/claudeClient.ts` — calls `@anthropic-ai/sdk` with
  `output_config: { format: { type: 'json_schema', schema: ANALYSIS_SCHEMA } }` for a
  guaranteed-shape response; `AiNotConfiguredError` when no API key is set,
  `AiRefusedError` when the model's safety classifier declines (`stop_reason ===
  'refusal'`) — both surfaced as real HTTP error responses, never silently swallowed or
  faked
- `backend/src/services/scriptgen/versions.ts` — `backupScript()` copies the current
  on-disk script into a `.versions/<file>.<timestamp>.bak` sidecar *before* an AI-applied
  fix can overwrite it, so the original human recording is never silently lost (the
  "back up before AI-applied fixes" rule)
- `POST /api/ai/analyze-failure` — looks up the execution item, the last failed step, and
  live device status, then calls the real Claude API (never mocked); `POST
  /api/ai/apply-fix` — backs up, then writes the fix, only ever triggered by an explicit
  user click, never automatically
- Frontend: `FailureAnalysisPanel` in `ExecutionView` shows the summary, likely causes,
  suggested fix, and a collapsible full-script diff view with confidence-colored
  labeling; "AI Analyze Failure" and "Run Again" buttons appear on any failed/timed-out/
  interrupted item; "Apply AI Fix" is a separate explicit action from analysis itself

**What's verified vs. not:** the prompt-building logic (7 unit tests — message shape,
device-info formatting, log capping, optional-field omission) and the backup/versioning
logic (5 unit tests against real temp-directory I/O) are fully covered. The `/api/ai/*`
routes and error-handling paths (missing API key → 400, execution/item not found → 404)
were exercised against the real running backend. **No real Claude API call has been made
end-to-end**, because no `ANTHROPIC_API_KEY` is configured on this development machine —
the request-building and response-parsing code is written directly against the installed
SDK's type definitions (verified by reading `@anthropic-ai/sdk`'s actual `.d.ts` files,
not assumed from training knowledge), but the real shape/quality of a live model response
remains unverified until a key is added. That's the first thing to check once an API key
is available. Also caught and fixed during this phase: an endpoint test accidentally
overwrote the real Phase 3 smoke test file on disk via the fix-apply endpoint (correct
endpoint behavior, wrong target) — caught immediately and the original file was restored.

## Phase 9 — Document-to-Test

Lets a user upload a requirements/spec document and turn it into reviewable, approvable
test cases - a separate workflow from device recording, since there's no live app or UI
tree to ground it in. Every script this phase produces is generated from AI-suggested
locator guesses, never auto-executed, and only written to disk once a human has approved
the specific test case.

- `backend/src/services/ai/client.ts` - extracted the shared "call Claude for a
  structured JSON response" logic (client init, refusal handling, response parsing) out
  of Phase 8's `claudeClient.ts` so both AI features (failure analysis, document
  analysis) share one implementation instead of duplicating it
- `backend/src/services/document/parsers.ts` - `parseDocument()` dispatches by file
  extension to real parsers for all seven required formats: `pdf-parse` (PDF),
  `mammoth` (`.docx` → raw text), `exceljs` (`.xlsx` → per-sheet `"col | col"` rows),
  `csv-parse` (CSV → the same row format), and direct UTF-8 reads for `.txt`/`.md`, with
  `.json` validated by parsing then re-stringifying. Extracted text is capped at 60,000
  characters (mirroring the `MAX_LOG_LINES` precedent from Phase 8) so a huge upload
  can't blow past the model's context or balloon token cost
- `backend/src/services/document/prompt.ts` - a system prompt instructing Claude to
  break the document into scenarios/test cases with concrete UI steps, prefer
  `getByTestId`/`getByLabel`/`getByText`/`getByRole`/`getByPlaceholder` locator guesses
  over fabricating one, flag credential-shaped fields as sensitive instead of writing a
  literal value, and avoid inventing requirements the document doesn't contain
- `backend/src/services/document/analyzer.ts` - calls the shared AI client with a
  strict JSON schema and assigns stable ids to every generated scenario/test case
- `backend/src/services/document/scriptRenderer.ts` - the deterministic (non-AI)
  renderer that turns one **approved** test case into an actual Mobilewright script.
  Only forms matching `SAFE_LOCATOR_PATTERN` (a whitelist of the five known
  `getBy*(...)` call shapes) are ever interpolated into the generated file - anything
  else becomes a `// TODO: verify` comment, since an AI-suggested locator string is
  going straight into executable script text and has no live device to be checked
  against first, unlike Phase 6's recording-based generator
- `backend/src/services/document/store.ts` - persists each upload as a
  `DocumentSession` under `uploads/sessions/<id>.json` (same pattern as the execution
  manager), plus the original uploaded bytes under `uploads/originals/` with the
  client-supplied filename sanitized to a safe basename before touching a path
- `POST /api/documents/upload` (multipart, `multer` memory storage, 20 MB cap),
  `GET /api/documents`, `GET /api/documents/:id`, `POST /api/documents/:id/analyze`
  (the real, explicit-only Claude call), `PUT /api/documents/:id/scenarios` (the review
  step - approve/reject individual test cases), `POST /api/documents/:id/generate-script`
  (rejects with 400 if the target test case isn't `approved` yet - this is the one
  enforcement point for "never auto-generate/execute document-derived scripts")
- Frontend: a real "Documents" section in the left panel (upload button + status-dotted
  list), and a new DOCUMENTS tab in the central workspace (`DocumentReviewView`) showing
  the extracted-text preview, an "Analyze with AI" button, and per-test-case
  approve-checkboxes with "Generate TS"/"Generate JS" buttons that stay disabled until
  the checkbox is ticked

**A real npm audit finding was caught before it shipped:** the obvious `xlsx` (SheetJS)
package has two open high-severity advisories (prototype pollution, ReDoS) with no fix
published to npm - swapped for `exceljs` instead. That pulled in one moderate
vulnerability transitively (an old `uuid`), fixed the same way as Phase 6's dompurify
issue: an npm `overrides` entry pinning `uuid@^11.1.1`. `npm audit` reports zero
vulnerabilities after the fix.

**A real, not-hypothetical typings bug was also hit and fixed:** `exceljs`'s own
`.d.ts` declares an ambient `interface Buffer extends ArrayBuffer {}` that collides with
`@types/node`'s real (generic) `Buffer` type - a known upstream issue, not a mistake in
this codebase - worked around with a narrow, commented cast at the one call site that
needs it.

**What's verified vs. not:** 30 new unit tests cover the parts that don't need a live
Claude API key - real extension-based dispatch, real TXT/MD/JSON/CSV parsing, a real
xlsx file round-tripped through ExcelJS's own writer, honest error surfacing for a
corrupt PDF and an unsupported extension (never a fabricated success), the full
session-persistence CRUD path against real temp-directory I/O, and the script renderer's
locator-safety whitelist (including a test that a deliberately malicious locator
expression - `getByText('x')); process.exit(1); //` - is rejected rather than
interpolated). The full upload → review → generate-script flow was exercised end-to-end
against the real running backend with a real markdown file and a synthetic (but
structurally valid) reviewed scenario, confirming: real file lands in
`generated-tests/typescript/`, sensitive fields route through `process.env`, unapproved
test cases are rejected with 400, and unsupported file types are rejected with a real
error before any parsing is attempted. As with Phase 8, **no real Claude document
analysis has been run end-to-end** (no API key configured here) - the `/analyze`
endpoint correctly returns the honest "ANTHROPIC_API_KEY is not set" error rather than
faking a result. The frontend build and lint are clean, but genuine in-browser
confirmation of the new Documents tab has **not** been done, since no browser/screenshot
tool is available in this environment - worth a manual click-through next time the app
is opened, and the first real thing to check once an API key is available is whether a
real PDF/DOCX spec produces sensible scenarios.

## Phase 10 — Reporting

Turns any persisted `ExecutionSession` (already saved by Phase 7 under
`reports/executions/<id>.json`) into a downloadable report in all five required formats.
No new data model was needed - reporting is a pure transformation of data the Execution
Engine already produces honestly.

- `backend/src/services/reporting/summary.ts` - pure `computeSummary()`: counts items by
  status and computes total duration from `startedAt`/`finishedAt` (undefined, not a
  fabricated number, when the session hasn't finished)
- `backend/src/services/reporting/htmlReport.ts` - a self-contained, styled HTML report
  (summary counts, per-script pass/fail, per-step ✓/✗, failure screenshots inline). Every
  interpolated value is run through a real `escapeHtml()` - not just for style, this
  actually prevents a file name or captured error message with `<script>`/`onerror=` in
  it from executing when the report is opened in a browser
- `backend/src/services/reporting/xlsxReport.ts` - three-sheet workbook (Summary, Test
  Items, Steps) built with `exceljs`'s writer (the same library Phase 9 already added for
  reading `.xlsx` uploads)
- `backend/src/services/reporting/pdfReport.ts` - a real paginated PDF built with
  `pdfkit`, streamed into a `Buffer` via its `data`/`end` events
- `backend/src/services/reporting/zipReport.ts` - bundles `report.html` + `report.json` +
  the session's failure screenshots (if any exist on disk) into a single zip, using
  `archiver`'s `ZipArchive` class
- `GET /api/reports` (reuses `executionManager.list()` - the same sessions already
  visible to the Execution Engine), `GET /api/reports/:id/:format` (`html`/`pdf`/`xlsx`/
  `json`/`zip`, correct `Content-Type` and `Content-Disposition: attachment` per format,
  404 for an unknown session, 400 for an unsupported format)
- Frontend: a real "Reports" section in the left panel listing every execution session
  with one download link per format

**A real, not-assumed, API mismatch was caught here:** `archiver`'s installed version
(8.0.0) turned out to have dropped the classic `archiver('zip')` factory-function API in
favor of named exports (`ZipArchive`, `TarArchive`, `JsonArchive`) - confirmed by reading
the actual installed package source, not by recalling the older API from training data.
Using the stale factory-function pattern would have failed at runtime despite type
declarations looking plausible.

**What's verified vs. not:** 12 new unit tests cover the parts that don't need a live
device - summary counting/duration math, HTML escaping (including a deliberate XSS
payload in a file name and an error message, confirmed neutralized), a real `.xlsx`
buffer read back and asserted against by ExcelJS itself, a real PDF buffer with a
genuine `%PDF-` header, and a real zip buffer with a genuine `PK` header (both with and
without a screenshots directory present). Beyond unit tests, all five formats were
generated end-to-end against the real running backend from an actual (deviceless,
`interrupted`-status) execution session - downloaded and verified with the `file` command
confirming each is a genuine PDF/Zip/XLSX, not just a file with the right extension - and
the 400/404 error paths were exercised directly. As with every prior phase, genuine
in-browser confirmation of the new Reports section in the left panel has **not** been
done, since no browser tool is available here.

## Phase 11 — Final UI/UX

Rather than adding new surface area, this phase audited the whole frontend for exactly
the kind of thing the "never fake state" rule in CLAUDE.md is meant to catch: leftover
Phase 1 scaffolding that still looked plausible but had quietly never been wired to the
real data every later phase produced.

- **`RightPanel`'s "Execution Status" section** was still the literal Phase 1 placeholder
  - hardcoded to always render "No execution running" regardless of whether a script
  was actually mid-run. Now takes the real `executionSession` and shows the session
  status, current item index, current file name, and current step title while running
- **`RightPanel`'s "Live Logs" section** was likewise a permanent "No logs yet" stub,
  even though the Execution Engine (Phase 7) has been streaming real per-item logs since
  it was built. Now shows the last 30 lines from whichever item most recently produced
  logs
- **`BottomSummary`** was the most misleading of the three: five report-format buttons
  that were `disabled` unconditionally in the JSX, no matter that Phase 10 made every one
  of those formats genuinely downloadable. Now shows real pass/fail counts from the
  current session and turns into five live download links (via the same
  `reportDownloadUrl()` helper the left panel's Reports section uses) the moment a
  session actually finishes - `finishedAt` is checked explicitly, since the report
  endpoints read from a file the Execution Engine only writes after completion, so
  enabling the links any earlier would 404
- Audited every other panel (`Header`, `StatusBadge`, `AdbSetupNotice`, `LeftPanel`,
  `ExecutionView`, `DocumentReviewView`) for the same failure mode; found none - loading
  states (`Checking…`, `Uploading…`, `Analyzing…`, disabled buttons mid-action) and empty
  states ("No recordings captured yet", "No documents uploaded yet", etc.) were already
  wired correctly in the phases that introduced them

**What's verified vs. not:** this was a wiring/audit pass, not new business logic, so no
new unit tests were added - the underlying data (`ExecutionSession`, report URLs) is
already covered by Phases 7 and 10's tests. Frontend build and lint are clean. As with
every UI phase, genuine in-browser confirmation has **not** been done, since no
browser/screenshot tool is available in this environment - worth a manual click-through
(start a run, confirm the right panel updates live, confirm the bottom bar's download
links appear once it finishes) the next time the app is opened in a real browser.

## Phase 12 — Final QA

A systematic pass through the failure modes and code paths the original spec calls out,
run against the real (deviceless) backend rather than assumed from reading the code -
each item below was actually exercised, and one real bug was found and fixed.

- **ADB missing**: restarted the backend with `ADB_PATH` pointed at a nonexistent binary
  - `GET /api/device/status` correctly reports `{adbAvailable: false, connectionState:
  "adb-missing"}` with a real error message, not a crash or a silent fallback
- **Device disconnected**: the real, permanent state of this development machine (no
  phone attached) - confirmed `disconnected` with an empty device list, as it has been
  since Phase 2
- **Device unauthorized**: covered by `deviceManager.test.ts`'s unit tests against real
  `adb devices -l` output shapes (Phase 2); cannot be exercised live without a physical
  device prompting the USB-debugging authorization dialog
- **Recording / locator selection**: covered by the 49 + 10 unit tests from Phases 4-5
  against realistic evdev and UI-tree fixtures; live recording against a real screen
  remains the one thing that needs a physical device to fully confirm, as noted in every
  relevant phase above
- **TS + JS script generation**: Phase 6 already covered both languages for
  recording-based generation; this pass specifically confirmed Phase 9's document-based
  generator also produces a correct `.test.js` file (not just `.test.ts`) - verified via
  a real `POST /api/documents/:id/generate-script` call with `language: "javascript"`
- **Execution + failed execution**: re-confirmed a real (deviceless) execution genuinely
  reports `timedOut`/`interrupted` with the real ~20s device-setup error, persisted and
  independently downloadable in every report format
- **AI analysis**: re-confirmed `/api/ai/analyze-failure` and `/api/documents/:id/analyze`
  both return the honest `ANTHROPIC_API_KEY is not set` 400 rather than fabricating a
  result, consistent with every AI-touching phase
- **Idle-state honesty**: confirmed `GET /api/execution/active` and `GET
  /api/recording/active` return `{session: null}` (not an error) when nothing is running,
  and `POST /api/execution/stop` returns a real 409 when there's nothing to stop
- **Report generation**: re-confirmed all five formats download correctly with genuine
  file signatures (already covered in Phase 10)

**One real bug found and fixed:** `frontend/vite.config.ts`'s dev-server proxy only
forwarded `/api` and `/ws` to the backend - not `/screenshots`, the static route Phase 7
added for serving failure-screenshot images. In dev mode this meant every `<img
src="/screenshots/...">` in the Execution view would have 404'd through Vite's own dev
server instead of reaching the backend. Fixed by adding a `/screenshots` proxy entry;
confirmed by comparing an identical Express 404 response through the proxy versus
directly against the backend for the same path.

**What's still honestly unverified, and why:** every phase above that touches a
physical Android device (live recording, live locator resolution against a real UI tree,
a genuinely passing execution with a real screenshot, a real Claude API response for
either AI feature) remains unverified in this environment, because no physical device
and no `ANTHROPIC_API_KEY` are available here. This isn't a gap introduced by skipping
work - it's the honest state of a platform whose two core external dependencies (a USB-
attached Android phone, an Anthropic API key) are both absent on this development
machine. The concrete first-run checklist once both are available: plug in a phone with
USB debugging authorized and confirm `connected`; start a recording and confirm the
action feed reflects real taps; run a real script against a real app and confirm a
passing result with a live progress bar; add `ANTHROPIC_API_KEY` to `.env` and confirm
both `/ai/analyze-failure` and `/documents/:id/analyze` return real, sensible model
output.
