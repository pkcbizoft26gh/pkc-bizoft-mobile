import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AppState, Platform } from 'react-native'

// The app is useless without the backend, so "online" means "the PKC BIZOFT
// backend is actually reachable" rather than "the phone says it has Wi-Fi".
// This also catches the common case of being connected to a router that has
// no internet. A probe is used instead of a native network module so it works
// in Expo Go and in existing builds without a rebuild.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

// Slow Wi-Fi or mobile data can take several seconds for the first request
// (DNS + TLS), so give each attempt time and retry once before giving up.
const PROBE_TIMEOUT_MS = 7000
const PROBE_ATTEMPTS = 2
const ONLINE_INTERVAL_MS = 5000
const OFFLINE_INTERVAL_MS = 2500
// Require two failed probes in a row before showing the popup, so one slow
// request doesn't flash the popup on a weak-but-working connection.
const FAILURES_BEFORE_OFFLINE = 2

type ConnectionState = {
  isOnline: boolean
  // True while a manual "Try again" check is running.
  checking: boolean
  // Runs a check right now and resolves to whether the backend is reachable.
  recheck: () => Promise<boolean>
  // Call this when a request fails with a network error, so the popup
  // appears immediately instead of waiting for the next scheduled probe.
  reportNetworkFailure: () => void
}

const ConnectionContext = createContext<ConnectionState>({
  isOnline: true,
  checking: false,
  recheck: async () => true,
  reportNetworkFailure: () => {},
})

async function probeOnce(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

  try {
    // Any HTTP response, even an error status, proves we reached the server.
    // Only a thrown error (no network, DNS failure, timeout) counts as offline.
    await fetch(`${supabaseUrl}/auth/v1/health`, {
      method: 'GET',
      headers: supabaseKey ? { apikey: supabaseKey } : undefined,
      signal: controller.signal,
    })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// A single slow or dropped request must not show the offline popup, so the
// backend only counts as unreachable when every attempt fails. With no network
// at all each attempt fails immediately, so real outages are still detected fast.
async function probeBackend(): Promise<boolean> {
  if (!supabaseUrl) return true

  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt += 1) {
    if (await probeOnce()) return true
    if (attempt < PROBE_ATTEMPTS - 1) await new Promise(resolve => setTimeout(resolve, 400))
  }
  return false
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true)
  const [checking, setChecking] = useState(false)

  const failures = useRef(0)
  const online = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef<Promise<boolean> | null>(null)

  const applyResult = useCallback((reachable: boolean, immediate = false) => {
    if (reachable) {
      failures.current = 0
      if (!online.current) {
        online.current = true
        setIsOnline(true)
      }
      return
    }

    failures.current += 1
    if (online.current && (immediate || failures.current >= FAILURES_BEFORE_OFFLINE)) {
      online.current = false
      setIsOnline(false)
    }
  }, [])

  const runProbe = useCallback(
    (immediate = false) => {
      // Share one request if several callers ask at once.
      if (!inFlight.current) {
        inFlight.current = probeBackend().finally(() => {
          inFlight.current = null
        })
      }
      return inFlight.current.then(reachable => {
        applyResult(reachable, immediate)
        return reachable
      })
    },
    [applyResult],
  )

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(
      async () => {
        await runProbe()
        schedule()
      },
      online.current ? ONLINE_INTERVAL_MS : OFFLINE_INTERVAL_MS,
    )
  }, [runProbe])

  useEffect(() => {
    runProbe().then(schedule)

    // Check again the moment the app comes back to the foreground, since
    // the connection may have changed while it was in the background.
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') runProbe().then(schedule)
    })

    // On web the browser tells us instantly when the connection drops.
    const onOffline = () => {
      applyResult(false, true)
      schedule()
    }
    const onOnline = () => {
      runProbe().then(schedule)
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('offline', onOffline)
      window.addEventListener('online', onOnline)
    }

    return () => {
      if (timer.current) clearTimeout(timer.current)
      appStateSub.remove()
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('offline', onOffline)
        window.removeEventListener('online', onOnline)
      }
    }
  }, [applyResult, runProbe, schedule])

  const recheck = useCallback(async () => {
    setChecking(true)
    try {
      const reachable = await runProbe(true)
      schedule()
      return reachable
    } finally {
      setChecking(false)
    }
  }, [runProbe, schedule])

  const reportNetworkFailure = useCallback(() => {
    // Confirm with a real probe before blocking the user, in case the
    // failing request was a one-off.
    runProbe(true).then(schedule)
  }, [runProbe, schedule])

  const value = useMemo(
    () => ({ isOnline, checking, recheck, reportNetworkFailure }),
    [isOnline, checking, recheck, reportNetworkFailure],
  )

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}

export function useConnection() {
  return useContext(ConnectionContext)
}

// Supabase and fetch report network problems as errors with these messages.
export function isNetworkError(error: unknown) {
  const message = String((error as { message?: string } | null)?.message ?? error ?? '')
  return /network request failed|failed to fetch|network error|timed out|timeout|internet|offline|load failed/i.test(
    message,
  )
}
