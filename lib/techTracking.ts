import { useEffect, useRef } from 'react'
import * as Location from 'expo-location'

import { supabase } from './supabase'

const SEND_EVERY_MS = 20000

/**
 * While the technician has started jobs they have not arrived at yet, send
 * the phone's position so those customers (and staff) can see them coming.
 * Foreground only: it runs while the app is open, and the database deletes the
 * position as soon as they check in. Pass an empty list to stop.
 */
export function useShareTechLocation(repairIds: string[]) {
  const key = repairIds.slice().sort().join(',')
  const idsRef = useRef<string[]>(repairIds)
  idsRef.current = repairIds

  useEffect(() => {
    if (!key) return
    let cancelled = false
    let sub: Location.LocationSubscription | null = null
    let lastSent = 0

    const send = (coords: { latitude: number; longitude: number }) => {
      const now = Date.now()
      if (now - lastSent < SEND_EVERY_MS) return
      lastSent = now
      for (const id of idsRef.current) {
        void supabase
          .rpc('update_tech_location', { p_repair: id, p_lat: coords.latitude, p_lng: coords.longitude })
          .then(({ error }) => {
            if (error) console.warn('Share location failed:', error.message)
          })
      }
    }

    const start = async () => {
      let permission = await Location.getForegroundPermissionsAsync()
      if (permission.status !== 'granted') permission = await Location.requestForegroundPermissionsAsync()
      if (cancelled || permission.status !== 'granted') return

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: SEND_EVERY_MS, distanceInterval: 25 },
        (fix) => send(fix.coords),
      )
      if (cancelled) sub.remove()
    }

    void start().catch((err) => console.warn('Location watch failed:', err))
    return () => {
      cancelled = true
      sub?.remove()
    }
  }, [key])
}
