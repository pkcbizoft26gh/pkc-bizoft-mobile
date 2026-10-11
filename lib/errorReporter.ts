import { Platform } from 'react-native'
import Constants from 'expo-constants'

import { supabase } from '@/lib/supabase'

// Sends crashes and failed actions to the PKC BIZOFT team (Insights > App errors
// on the web), so problems are found before customers complain. Reporting must
// never cause a problem itself: it swallows its own failures, ignores repeats
// of the same message for a minute and sends nothing when nobody is signed in.

type Handler = (error: unknown, isFatal?: boolean) => void
type ErrorUtilsLike = { getGlobalHandler: () => Handler; setGlobalHandler: (handler: Handler) => void }

let currentScreen = ''
let installed = false
const recent = new Map<string, number>()
const REPEAT_MS = 60_000

export function setCurrentScreen(path: string) {
  currentScreen = path
}

export function reportError(error: unknown, screen?: string, fatal = false) {
  try {
    const err = error as { message?: string; stack?: string } | string | null | undefined
    const message = typeof err === 'string' ? err : err?.message || 'Unknown error'
    const stack = typeof err === 'object' && err ? err.stack : undefined

    // Network problems are expected on mobile data and say nothing about a bug.
    if (/network request failed|fetch failed|unknownhost|unable to resolve host|timed? ?out/i.test(message)) return

    const key = `${screen ?? currentScreen}:${message}`.slice(0, 200)
    const now = Date.now()
    if ((recent.get(key) ?? 0) > now - REPEAT_MS) return
    recent.set(key, now)

    void supabase
      .rpc('log_app_error', {
        p_message: message,
        p_stack: stack ?? null,
        p_screen: screen ?? currentScreen ?? null,
        p_version: Constants.expoConfig?.version ?? null,
        p_platform: Platform.OS,
        p_fatal: fatal,
      })
      .then(
        () => undefined,
        () => undefined,
      )
  } catch {
    // Never let the reporter break the app.
  }
}

/** Hooks the global crash handler once. Call from the root layout. */
export function installErrorReporter() {
  if (installed) return
  installed = true
  try {
    const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils
    if (!utils) return
    const previous = utils.getGlobalHandler()
    utils.setGlobalHandler((error, isFatal) => {
      reportError(error, undefined, !!isFatal)
      previous(error, isFatal)
    })
  } catch {
    // ignore
  }
}
