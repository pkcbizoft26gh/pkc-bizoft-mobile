import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { useIsFocused } from 'expo-router'

import { supabase } from '@/lib/supabase'

// Keeps a screen up to date by itself. It reloads when:
//   * a row changes in one of the listed tables (live feed; row-level
//     security decides which changes this person receives),
//   * the app comes back to the front, or this screen comes back into view,
//   * and every 2 minutes while this screen is on view, in case the live feed drops
//     (kept slow to save mobile data; the live feed does the real work).
// Bursts of changes are folded into one reload.

const SAFETY_MS = 120_000
const DEBOUNCE_MS = 500

let channelCount = 0

export function useLiveRefresh(
  tables: string[],
  onChange: () => unknown,
  options: { enabled?: boolean; filter?: string } = {},
) {
  const { enabled = true, filter } = options
  const callback = useRef(onChange)
  callback.current = onChange
  const key = tables.join(',')
  const focused = useIsFocused()
  const focusedRef = useRef(focused)
  focusedRef.current = focused

  // Coming back to this screen: catch up at once.
  const wasFocused = useRef(focused)
  useEffect(() => {
    if (enabled && focused && !wasFocused.current) void callback.current()
    wasFocused.current = focused
  }, [focused, enabled])

  useEffect(() => {
    if (!enabled || tables.length === 0) return undefined

    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void callback.current(), DEBOUNCE_MS)
    }

    channelCount += 1
    let channel = supabase.channel(`live-${channelCount}-${key}`)
    for (const table of tables) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        refresh,
      )
    }
    channel.subscribe()

    const safety = setInterval(() => {
      if (AppState.currentState === 'active' && focusedRef.current) void callback.current()
    }, SAFETY_MS)

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })

    return () => {
      clearTimeout(timer)
      clearInterval(safety)
      appState.remove()
      void supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, filter])
}
