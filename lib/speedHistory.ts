import AsyncStorage from '@react-native-async-storage/async-storage'

import type { SpeedResult } from '@/lib/speedtest'

// Past speed tests are kept on the phone (per account) so a customer can show
// when the internet was slow. Nothing is sent to the server.

export type SpeedEntry = {
  at: number
  pingMs: number | null
  downloadMbps: number | null
  uploadMbps: number | null
  planMbps: number | null
}

const MAX_ENTRIES = 30
const keyFor = (userId: string) => `speed-history:${userId}`

export async function loadSpeedHistory(userId: string): Promise<SpeedEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId))
    const list = raw ? (JSON.parse(raw) as SpeedEntry[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** Adds a finished test (newest first) and returns the updated list. */
export async function saveSpeedResult(userId: string, result: SpeedResult, planMbps: number | null) {
  const entry: SpeedEntry = {
    at: Date.now(),
    pingMs: result.pingMs,
    downloadMbps: result.downloadMbps,
    uploadMbps: result.uploadMbps,
    planMbps,
  }
  const next = [entry, ...(await loadSpeedHistory(userId))].slice(0, MAX_ENTRIES)
  try {
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(next))
  } catch {
    // History is a convenience; ignore storage problems.
  }
  return next
}

export async function clearSpeedHistory(userId: string) {
  try {
    await AsyncStorage.removeItem(keyFor(userId))
  } catch {
    // ignore
  }
}

/** Average download of the saved tests, or null with none. */
export function averageDownload(entries: SpeedEntry[]) {
  const values = entries.map((e) => e.downloadMbps).filter((v): v is number => v !== null)
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}
