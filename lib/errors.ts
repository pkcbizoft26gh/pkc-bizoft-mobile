// Turns raw errors (e.g. "java.net.UnknownHostException ...", "violates row-level
// security policy", "JWT expired") into text a customer can act on. Messages we wrote
// ourselves in the database ("You already rated this job.") pass through unchanged.
const NETWORK_PATTERN =
  /network request failed|fetch failed|failed to fetch|unknownhost|unable to resolve host|timed? ?out|failed to connect|no address associated|econn|enotfound|aborterror/i

// Anything that reads like database, server or code internals.
const TECHNICAL_PATTERN =
  /violates|duplicate key|permission denied|row-level security|\brls\b|jwt|schema cache|pgrst|\bpg\b|sqlstate|relation ".*" does not exist|column ".*" does not exist|could not find the function|function .* does not exist|invalid input syntax|null value in column|syntax error|unexpected token|\bjson\b|undefined is not|cannot read propert|is not a function|is not an object|typeerror|referenceerror|internal server|service unavailable|bad gateway/i

export function isNetworkError(error: any): boolean {
  return NETWORK_PATTERN.test(String(error?.message ?? error ?? ''))
}

export function friendlyError(error: any, fallback: string): string {
  if (isNetworkError(error)) {
    return 'No internet connection. Check your Wi-Fi or mobile data, then try again.'
  }
  const message = String(error?.message ?? '').trim()
  if (!message) return fallback
  if (/jwt expired|invalid jwt|refresh token/i.test(message)) {
    return 'Your session ended. Please sign in again.'
  }
  if (TECHNICAL_PATTERN.test(message) || message.length > 220) {
    return fallback
  }
  return message
}
