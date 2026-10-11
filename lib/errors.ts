// Turns raw errors (e.g. "java.net.UnknownHostException ...") into text a
// customer can act on. Network failures get a plain "check your connection" line.
const NETWORK_PATTERN =
  /network request failed|fetch failed|unknownhost|unable to resolve host|timed? ?out|failed to connect|no address associated|econn|enotfound/i

export function isNetworkError(error: any): boolean {
  return NETWORK_PATTERN.test(String(error?.message ?? error ?? ''))
}

export function friendlyError(error: any, fallback: string): string {
  if (isNetworkError(error)) {
    return 'No internet connection. Check your Wi-Fi or mobile data, then pull down to refresh.'
  }
  return error?.message || fallback
}
