// The deployed PKC BIZOFT web app. It sends our own Gmail verification codes
// at sign-up, because it holds the mail credentials (the phone must not).
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || 'https://sme-systems-webapp.vercel.app'
).replace(/\/+$/, '')

export async function postApi<T = { ok?: boolean; error?: string }>(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, data }
}
