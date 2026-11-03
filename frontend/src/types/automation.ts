export type DoctorCheckStatus = 'ok' | 'warning' | 'error'

export interface DoctorCheck {
  id: string
  name: string
  status: DoctorCheckStatus
  version: string | null
  details: string | null
}

export interface MobilewrightReadiness {
  ready: boolean
  requiredChecks: DoctorCheck[]
}
