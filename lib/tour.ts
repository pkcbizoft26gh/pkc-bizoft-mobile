// Shared state for the spotlight tour: which on-screen elements can be pointed at, and
// who the tour is for. Screens register their buttons with tourRef('some-id'); the tour
// overlay (components/AppTour.tsx) measures them when a step needs them.

export type Rect = { x: number; y: number; width: number; height: number }

type Measurable = { measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void }

const targets = new Map<string, Measurable>()

/** A ref callback for any View/Pressable: <Pressable ref={tourRef('plan-bills')} /> */
export function tourRef(id: string) {
  return (node: unknown) => {
    if (node && typeof (node as Measurable).measureInWindow === 'function') targets.set(id, node as Measurable)
    else targets.delete(id)
  }
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
