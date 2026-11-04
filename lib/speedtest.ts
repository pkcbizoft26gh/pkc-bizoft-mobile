import { planSpeed } from './plans'
// Simple network speed test against Cloudflare's public speed endpoints.
// Results are an estimate: they include the phone, the Wi-Fi link and the
// route to the test server, not only the customer's plan.

const BASE = 'https://speed.cloudflare.com'

export type SpeedPhase = 'idle' | 'ping' | 'download' | 'upload' | 'done' | 'error'

export type SpeedResult = {
  pingMs: number | null
  downloadMbps: number | null
  uploadMbps: number | null
}

// How the test works (close to how Ookla and Cloudflare measure):
// - several connections at once, so one slow connection does not cap the result;
// - each test runs for a set time instead of a set size, so slow and fast lines both get a fair test;
// - the first moments are thrown away (connection setup and TCP slow-start make them look slow);
// - requests grow in size while they finish quickly, so request overhead does not drag the number down.

type Transfer = { start: number; end: number; bytes: number }

const now = () => Date.now()

export async function measurePing(samples = 8) {
  const times: number[] = []
  for (let i = 0; i < samples; i++) {
    const started = now()
    const response = await fetch(`${BASE}/__down?bytes=0&r=${started}${i}`, { cache: 'no-store' })
    await response.arrayBuffer()
    // The first request also opens the connection (DNS, TLS); it is not the line's ping.
    if (i > 0) times.push(now() - started)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]
}

/** Mbps from the transfers that started after the warm-up. */
function throughput(transfers: Transfer[], warmupEnd: number) {
  const counted = transfers.filter((t) => t.start >= warmupEnd)
  const used = counted.length >= 2 ? counted : transfers
  if (used.length === 0) return 0
  const from = Math.min(...used.map((t) => t.start))
  const to = Math.max(...used.map((t) => t.end))
  const bytes = used.reduce((sum, t) => sum + t.bytes, 0)
  const seconds = Math.max((to - from) / 1000, 0.001)
  return (bytes * 8) / seconds / 1_000_000
}

async function runStreams(
  streams: number,
  durationMs: number,
  warmupMs: number,
  minBytes: number,
  maxBytes: number,
  transfer: (bytes: number, tag: string) => Promise<void>,
) {
  const begin = now()
  const deadline = begin + durationMs
  const transfers: Transfer[] = []
  await Promise.all(
    Array.from({ length: streams }, async (_, stream) => {
      let size = minBytes
      let n = 0
      while (now() < deadline) {
        const start = now()
        await transfer(size, `${start}${stream}${n++}`)
        const end = now()
        transfers.push({ start, end, bytes: size })
        // Grow the request while it finishes in under a second.
        if (end - start < 1000) size = Math.min(size * 2, maxBytes)
      }
    }),
  )
  return throughput(transfers, begin + warmupMs)
}

export async function measureDownload() {
  return runStreams(6, 9000, 2000, 1_000_000, 25_000_000, async (bytes, tag) => {
    const response = await fetch(`${BASE}/__down?bytes=${bytes}&r=${tag}`, { cache: 'no-store' })
    await response.arrayBuffer()
  })
}

export async function measureUpload() {
  const bodies = new Map<number, Uint8Array<ArrayBuffer>>()
  return runStreams(4, 7000, 1500, 500_000, 8_000_000, async (bytes) => {
    let body = bodies.get(bytes)
    if (!body) {
      body = new Uint8Array(bytes)
      bodies.set(bytes, body)
    }
    const response = await fetch(`${BASE}/__up`, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/octet-stream' },
      cache: 'no-store',
    })
    await response.arrayBuffer()
  })
}

/** Speedtest by Ookla: opens the Speedtest app if it is installed, otherwise speedtest.net. */
export const OOKLA_URL = 'https://www.speedtest.net/'

/** The plan's speed in Mbps, e.g. "G1_P750" -> 50. */
export function planSpeedMbps(planName: string | null | undefined) {
  return planSpeed(planName)
}
