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

async function timedFetch(url: string, init?: RequestInit) {
  const started = Date.now()
  const response = await fetch(url, { cache: 'no-store', ...init })
  return { response, started }
}

export async function measurePing(samples = 5) {
  const times: number[] = []
  for (let i = 0; i < samples; i++) {
    const { response, started } = await timedFetch(`${BASE}/__down?bytes=0&r=${Date.now()}${i}`)
    await response.arrayBuffer()
    times.push(Date.now() - started)
  }
  times.sort((a, b) => a - b)
  return times[Math.floor(times.length / 2)]
}

export async function measureDownload() {
  const bytesPerStream = 20_000_000
  const streams = 2
  const started = Date.now()
  const buffers = await Promise.all(
    Array.from({ length: streams }, async (_, i) => {
      const response = await fetch(`${BASE}/__down?bytes=${bytesPerStream}&r=${Date.now()}${i}`, { cache: 'no-store' })
      return response.arrayBuffer()
    }),
  )
  const seconds = (Date.now() - started) / 1000
  const total = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0)
  return (total * 8) / seconds / 1_000_000
}

export async function measureUpload() {
  const size = 6_000_000
  const body = new Uint8Array(size)
  const started = Date.now()
  const response = await fetch(`${BASE}/__up`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/octet-stream' },
    cache: 'no-store',
  })
  await response.arrayBuffer()
  const seconds = (Date.now() - started) / 1000
  return (size * 8) / seconds / 1_000_000
}

/** Pulls the speed out of a plan name like "G1_P750" -> 750. */
export function planSpeedMbps(planName: string | null | undefined) {
  const match = /P(\d+)/i.exec(planName || '')
  return match ? Number(match[1]) : null
}
