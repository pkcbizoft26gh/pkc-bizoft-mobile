import { supabase } from '@/lib/supabase'
import { API_BASE_URL } from '@/lib/api'

export type PinCheck = {
  checked: boolean
  matches?: boolean
  foundBarangay?: string | null
}

/**
 * Asks the server whether a GPS point is inside the barangay on the customer's
 * account. Returns null when the check could not run (offline, map service
 * slow), so the app never blocks someone because of it.
 */
export async function checkPin(point: { latitude: number; longitude: number }): Promise<PinCheck | null> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return null

    const response = await fetch(`${API_BASE_URL}/api/geocode/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(point),
    })
    if (!response.ok) return null
    return (await response.json()) as PinCheck
  } catch {
    return null
  }
}
