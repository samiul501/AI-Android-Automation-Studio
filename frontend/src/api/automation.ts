import type { MobilewrightReadiness } from '../types/automation'

export async function fetchMobilewrightReadiness(): Promise<MobilewrightReadiness> {
  const response = await fetch('/api/automation/mobilewright-status')
  if (!response.ok) {
    throw new Error(`Mobilewright readiness check failed with HTTP ${response.status}`)
  }
  return response.json()
}
