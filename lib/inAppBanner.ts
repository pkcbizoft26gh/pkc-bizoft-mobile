// A tiny event bus so any part of the app can show the top banner, and so a push
// arriving in the foreground can ask the inbox to refresh right away.

export type BannerMessage = {
  id: string
  title: string
  body?: string
  /** Where tapping the banner goes. */
  href?: string
}

type BannerListener = (message: BannerMessage) => void

const bannerListeners = new Set<BannerListener>()
const refreshListeners = new Set<() => void>()

export function subscribeBanner(listener: BannerListener) {
  bannerListeners.add(listener)
  return () => {
    bannerListeners.delete(listener)
  }
}

export function showBanner(message: BannerMessage) {
  bannerListeners.forEach((listener) => listener(message))
}

export function subscribeInboxRefresh(listener: () => void) {
  refreshListeners.add(listener)
  return () => {
    refreshListeners.delete(listener)
  }
}

/** Asks the inbox to reload now (a push just arrived, or a record changed). */
export function requestInboxRefresh() {
  refreshListeners.forEach((listener) => listener())
}
