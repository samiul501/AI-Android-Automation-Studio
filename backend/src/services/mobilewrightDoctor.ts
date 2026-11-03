import { runMobilewrightCli } from './mobilewrightCli.js'

export type DoctorCheckStatus = 'ok' | 'warning' | 'error'
export type DoctorCheckCategory = 'system' | 'ios' | 'android'

export interface DoctorCheck {
  id: string
  name: string
  category: DoctorCheckCategory
  status: DoctorCheckStatus
  version: string | null
  path: string | null
  details: string | null
  fix: string[] | null
}

export interface DoctorReport {
  mobilewrightVersion: string
  timestamp: string
  platform: string
  checks: DoctorCheck[]
}

export interface MobilewrightReadiness {
  // Whether this platform's core physical-device-over-ADB pipeline is usable.
  ready: boolean
  requiredChecks: DoctorCheck[]
  report: DoctorReport
}

// Only mobilecli and adb are required for our physical-device-over-ADB workflow.
// Android Studio, the emulator, and JDK/JAVA_HOME (which `mobilewright doctor`
// also checks) are for local app builds/emulation - this platform never requires
// them, per the "never make Android Studio mandatory" rule in CLAUDE.md.
const REQUIRED_CHECK_IDS = ['mobilecli', 'adb']

interface RawDoctorCheck {
  id: string
  name: string
  category: DoctorCheckCategory
  status: DoctorCheckStatus
  version: string | null
  path: string | null
  details: string | null
  fix: string[] | null
}

interface RawDoctorReport {
  mobilewright_version: string
  timestamp: string
  platform: string
  checks: RawDoctorCheck[]
}

export function selectRequiredChecks(checks: DoctorCheck[]): DoctorCheck[] {
  return checks.filter((check) => REQUIRED_CHECK_IDS.includes(check.id))
}

export function isReady(requiredChecks: DoctorCheck[]): boolean {
  return requiredChecks.length === REQUIRED_CHECK_IDS.length && requiredChecks.every((check) => check.status === 'ok')
}

export async function checkMobilewrightReadiness(): Promise<MobilewrightReadiness> {
  const { stdout } = await runMobilewrightCli(['doctor', '--json'])
  const parsed = JSON.parse(stdout) as RawDoctorReport

  const report: DoctorReport = {
    mobilewrightVersion: parsed.mobilewright_version,
    timestamp: parsed.timestamp,
    platform: parsed.platform,
    checks: parsed.checks,
  }

  const requiredChecks = selectRequiredChecks(report.checks)
  return { ready: isReady(requiredChecks), requiredChecks, report }
}
