// Shared state for the spotlight tour: which on-screen elements can be pointed at, and
// who the tour is for. Screens register their buttons with tourRef('some-id'); the tour
// overlay (components/AppTour.tsx) measures them when a step needs them.

export type Rect = { x: number; y: number; width: number; height: number }

type Measurable = { measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void }

const targets = new Map<string, Measurable>()

/** A ref callback for any View/Pressable: <Pressable ref={tourRef('plan-bills')} /> */
export function tourRef(id: string) {
  let mine: Measurable | null = null
  return (node: unknown) => {
    if (node && typeof (node as Measurable).measureInWindow === 'function') {
      mine = node as Measurable
      targets.set(id, mine)
    } else {
      // Only forget the element this ref registered; another screen may use the same id.
      if (mine && targets.get(id) === mine) targets.delete(id)
      mine = null
    }
  }
}

type Scrollable = Measurable & {
  scrollTo: (options: { y: number; animated?: boolean }) => void
  getInnerViewRef?: () => Measurable | null
}

const scrollers = new Map<string, Scrollable>()

/**
 * A ref callback for a screen's main ScrollView, keyed by its route ("/referrals"), so the tour
 * can scroll an element below the fold into view before lighting it up.
 */
export function tourScroll(route: string) {
  let mine: Scrollable | null = null
  return (node: unknown) => {
    if (node && typeof (node as Scrollable).scrollTo === 'function') {
      mine = node as Scrollable
      scrollers.set(route, mine)
    } else {
      if (mine && scrollers.get(route) === mine) scrollers.delete(route)
      mine = null
    }
  }
}

const windowY = (node: Measurable) =>
  new Promise<number | null>((resolve) => {
    try {
      node.measureInWindow((_x, y) => resolve(y))
    } catch {
      resolve(null)
    }
  })

/**
 * Scrolls the route's ScrollView so an element now at window y `fromY` ends up at window y `toY`.
 * Returns false when the screen has no registered ScrollView.
 */
export async function scrollTargetTo(route: string, fromY: number, toY: number): Promise<boolean> {
  const scroll = scrollers.get(route)
  const inner = scroll?.getInnerViewRef?.()
  if (!scroll || !inner) return false
  const innerY = await windowY(inner)
  const scrollY = await windowY(scroll)
  if (innerY === null || scrollY === null) return false
  // innerY sits above the ScrollView's top by the current offset.
  const offset = scrollY - innerY
  scroll.scrollTo({ y: Math.max(0, offset + (fromY - toY)), animated: true })
  return true
}

/** Where an element is on screen right now, or null when it is not on this screen. */
export function measureTarget(id: string): Promise<Rect | null> {
  const node = targets.get(id)
  if (!node) return Promise.resolve(null)
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) resolve(null)
    }, 400)
    try {
      node.measureInWindow((x, y, width, height) => {
        settled = true
        clearTimeout(timer)
        resolve(width > 0 && height > 0 ? { x, y, width, height } : null)
      })
    } catch {
      clearTimeout(timer)
      resolve(null)
    }
  })
}

export type TourSession = { userId: string; role: 'customer' | 'technician' }

let session: TourSession | null = null
const sessionListeners = new Set<() => void>()
const startListeners = new Set<() => void>()

export function setTourSession(next: TourSession | null) {
  const same = session?.userId === next?.userId && session?.role === next?.role
  session = next
  if (!same) sessionListeners.forEach((fn) => fn())
}

export const getTourSession = () => session

export function subscribeTourSession(fn: () => void) {
  sessionListeners.add(fn)
  return () => {
    sessionListeners.delete(fn)
  }
}

/** Starts the tour from the first step. */
export function startTour() {
  startListeners.forEach((fn) => fn())
}

export function subscribeTourStart(fn: () => void) {
  startListeners.add(fn)
  return () => {
    startListeners.delete(fn)
  }
}
