import * as Location from 'expo-location'

export type Coords = { latitude: number; longitude: number }

const FIX_TIMEOUT_MS = 12000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
    )
  })
}

/**
 * The phone's current position, or null when permission is refused, GPS is off
 * or no fix arrives in time. Pass { ask: false } to never show the permission
 * prompt (used for background refreshes).
 */
export async function getCurrentCoords(options: { ask?: boolean } = {}): Promise<Coords | null> {
  try {
    let permission = await Location.getForegroundPermissionsAsync()

    if (permission.status !== 'granted') {
      if (options.ask === false) return null
      permission = await Location.requestForegroundPermissionsAsync()
    }

    if (permission.status !== 'granted') return null

    const fix = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      FIX_TIMEOUT_MS,
    )

    if (fix) {
      return { latitude: fix.coords.latitude, longitude: fix.coords.longitude }
    }

    const last = await Location.getLastKnownPositionAsync()
    return last ? { latitude: last.coords.latitude, longitude: last.coords.longitude } : null
  } catch {
    return null
  }
}

/** Straight-line distance in kilometres (haversine). */
export function distanceKm(a: Coords, b: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return ''
  if (km < 1) return `${Math.max(Math.round(km * 1000 / 10) * 10, 10)} m`
  return `${km.toFixed(km < 10 ? 1 : 0)} km`
}

export type PreciseFix = Coords & {
  /** Horizontal accuracy in metres (smaller is better). */
  accuracy: number
}

/**
 * The phone's most precise position right now, for pinning a customer's house.
 * Unlike getCurrentCoords() it asks for the highest accuracy, keeps listening
 * until the fix is good (about 20 m) or the time runs out, and returns the
 * best one it saw. It never falls back to the "last known" position, which can
 * be somewhere else entirely. Returns null when permission is refused or no
 * fix arrived.
 */
export async function getPreciseCoords(
  options: { ask?: boolean; timeoutMs?: number; goodEnoughMeters?: number } = {},
): Promise<PreciseFix | null> {
  const timeoutMs = options.timeoutMs ?? 20000
  const goodEnough = options.goodEnoughMeters ?? 20

  try {
    let permission = await Location.getForegroundPermissionsAsync()
    if (permission.status !== 'granted') {
      if (options.ask === false) return null
      permission = await Location.requestForegroundPermissionsAsync()
    }
    if (permission.status !== 'granted') return null

    return await new Promise<PreciseFix | null>((resolve) => {
      let best: PreciseFix | null = null
      let finished = false
      let subscription: Location.LocationSubscription | null = null

      const finish = () => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        subscription?.remove()
        resolve(best)
      }

      const timer = setTimeout(finish, timeoutMs)

      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (position) => {
          const accuracy = position.coords.accuracy ?? 9999
          if (!best || accuracy < best.accuracy) {
            best = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy,
            }
          }
          if (accuracy <= goodEnough) finish()
        },
      )
        .then((sub) => {
          if (finished) sub.remove()
          else subscription = sub
        })
        .catch(() => finish())
    })
  } catch {
    return null
  }
}
