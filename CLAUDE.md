# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this is

AI Android Automation Studio — a web platform that connects to a **physical** Android
device via USB/ADB, records real user interactions, generates Mobilewright automation
scripts (TypeScript/JavaScript), executes them on-device, analyzes failures with AI, and
produces test reports. See [README.md](README.md) and [docs/PHASES.md](docs/PHASES.md).

## Non-negotiable rules

1. **Never fake device connection status.** GREEN/connected must come from a real `adb`
   check. Absent a real device, the UI state is `unknown`, not `connected`.
2. **Never fake test execution results.** Do not report a script as passed/failed
   without actually running it through Mobilewright/ADB.
3. **Do not silently swallow errors.** Surface them in logs and the UI.
4. **Android Studio is never a dependency.** Only ADB / Android SDK Platform-Tools.
5. **Prefer semantic locators over coordinates.** Coordinate-based locators are the last
   fallback, never the default.
6. **Never hardcode credentials or API keys.** Use environment variables
   (`backend/src/config/env.ts`) and `.env` (see `.env.example`). Mask secrets in logs.
7. **Never auto-apply AI-suggested script fixes.** Always require explicit user
   approval, and version/backup the script before applying a fix.
8. **Never install system software (ADB, SDKs, etc.) automatically.** Detect and inform
   the user; let them install it themselves.

## Architecture

- `frontend/` — React + Vite + TypeScript + Tailwind. Components under
  `src/components/layout` form the three-column dashboard shell; `src/types` holds shared
  domain types (e.g. `DeviceInfo`).
- `backend/` — Express + TypeScript. `src/config` for env/logging, `src/routes` for REST
  endpoints, `src/services` for automation/device/AI logic, `src/websocket` for the live
  event stream. Keep services modular — one responsibility per file, no monolithic
  handlers.
- Generated automation scripts live under `generated-tests/typescript` and
  `generated-tests/javascript`; recordings under `recordings/`; reports under `reports/`.

## Commands

```bash
npm install          # install all workspaces
npm run dev          # backend + frontend dev servers together
npm run build         # build both workspaces
npm run lint          # lint both workspaces
npm run test          # backend tests (vitest)
```

## Working style

- Implement phase-by-phase per `docs/PHASES.md`; verify (build/lint/test) before moving
  to the next phase.
- Keep files small and modular; no giant monolithic handlers or components.
- Add comments only where the *why* isn't obvious from the code.
