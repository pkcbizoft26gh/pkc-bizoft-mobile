import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePathname, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'

import { API_BASE_URL } from '@/lib/api'
import { colors, radii } from '@/constants/theme'
import {
  tourRef,
  getTourSession,
  measureTarget,
  scrollTargetTo,
  setTourSession,
  startTour,
  subscribeTourSession,
  subscribeTourStart,
  type Rect,
} from '@/lib/tour'

// A spotlight tour of the real app. The screen behind is dimmed, one button at a time is
// lit up with a short note, and tapping it (or Next) opens the next screen. It runs once
// after sign-in and can be replayed from Profile -> App tour.

type Step = {
  /** Screen to be on for this step. */
  route?: string
  /** What to light up: a registered element id (see lib/tour.ts) or "tab:<route name>". */
  target?: string
  title: string
  text: string
  /** Skipped quietly when the element is not on screen (for example "Apply for a plan" once you have one). */
  optional?: boolean
}

const CUSTOMER_TABS = ['customer', 'requests', 'referrals', 'profile']
const TECHNICIAN_TABS = ['technician', 'jobs', 'materials', 'technician-profile']

const CUSTOMER_STEPS: Step[] = [
  { route: '/customer', target: 'tab:customer', title: 'Home', text: 'Your main dashboard. Your plan, bills and progress start here.' },
  { route: '/customer', target: 'apply-plan', optional: true, title: 'Apply for a plan', text: 'No plan yet? Start here. Pick a speed, then pay.' },
  { route: '/customer', target: 'inbox-bell', optional: true, title: 'Notifications', text: 'New updates and reminders from Accounting show up here.' },
  { route: '/customer', target: 'qa-plan', title: 'Plan & Bills', text: 'Tap to see your bills, pay, and compare plans.' },
  { route: '/payment', target: 'pay-compare', optional: true, title: 'Compare plans', text: 'Every speed side by side, with prices.' },
  {
    route: '/payment',
    title: 'Paying',
    text: 'Choose GCash or bank, enter the reference number and upload your receipt. Accounting checks it, then you get a notice.',
  },
  { route: '/customer', target: 'qa-speed', title: 'Speed test', text: 'Check how fast your connection is right now.' },
  { route: '/customer', target: 'qa-help', title: 'Report an issue', text: 'Something wrong? Tap here to tell us.' },
  { route: '/requests', target: 'req-report', title: 'Requests', text: 'Describe the problem. A technician is assigned and you can chat with them.' },
  { route: '/referrals', target: 'tab:referrals', title: 'Referrals', text: 'Invite friends and earn when they get installed.' },
  { route: '/referrals', target: 'ref-share', optional: true, title: 'Share your code', text: 'Send your code to a friend. You earn ₱250 per friend.' },
  { route: '/referrals', target: 'ref-withdraw', optional: true, title: 'Withdraw', text: 'Ask Accounting to send your rewards to GCash or a bank.' },
  { route: '/profile', target: 'tab:profile', title: 'Profile', text: 'Your details, password, rating and help.' },
  { route: '/profile', target: 'prof-help', optional: true, title: 'Help & legal', text: 'Replay this tour, or read the Terms and Privacy Policy.' },
  { route: '/profile', target: 'prof-signout', optional: true, title: 'Sign out', text: 'The app asks "Are you sure?" first.' },
  { route: '/customer', target: 'help-bot', optional: true, title: 'Help bot', text: 'Ask about plans, bills, GCash or repairs. Drag it anywhere.' },
]

const TECHNICIAN_STEPS: Step[] = [
  { route: '/technician', target: 'tab:technician', title: 'Dashboard', text: 'Your numbers and ratings at a glance.' },
  { route: '/jobs', target: 'tab:jobs', title: 'Jobs', text: 'Nearest open jobs first. You can hold up to 3.' },
  { route: '/jobs', target: 'job-accept', optional: true, title: 'Accept a job', text: 'The job becomes yours. Choose solo or team up.' },
  { route: '/jobs', target: 'job-arrived', optional: true, title: 'I have arrived', text: 'Starts the job and tells the customer you are there.' },
  { route: '/materials', target: 'tab:materials', title: 'Materials', text: 'Log the materials you used on each job.' },
  { route: '/materials', target: 'truck-card', optional: true, title: 'My truck', text: 'What you carry, with a warning when an item runs low.' },
  { route: '/technician-profile', target: 'tab:technician-profile', title: 'Profile', text: 'Your details, help and this tour.' },
  { route: '/technician-profile', target: 'prof-signout', optional: true, title: 'Sign out', text: 'The app asks "Are you sure?" first.' },
]

const keyFor = (userId: string) => `app-tour-seen-v3-${userId}`

/** Opens the tour again (used by the Profile button). */
export function showAppTourAgain() {
  startTour()
}

/**
 * Lives inside the tabs and tells the tour who is signed in. The first time that
 * person signs in it also starts the tour.
 */
export function AppTour({ userId, role }: { userId: string | null; role: 'customer' | 'technician' | null }) {
  useEffect(() => {
    if (!userId || !role) {
      setTourSession(null)
      return
    }
    setTourSession({ userId, role })
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    AsyncStorage.getItem(keyFor(userId))
      .then((seen) => {
        if (seen || !live) return

        // Claim the automatic tour before opening it. Some steps leave the tabs
        // layout, which remounts this component; waiting until the tour closes
        // would make that remount start it again at step 1.
        return AsyncStorage.setItem(keyFor(userId), '1').then(() => {
          // A short wait so the Home screen is drawn before the first spotlight.
          if (live) timer = setTimeout(startTour, 1200)
        })
      })
      .catch(() => {})
    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
  }, [userId, role])

  return null
}

const PAD = 8
const TAB_BAR = 62
/** How long the ring takes to glide from one element to the next. */
const MOVE_MS = 320

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const near = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) < 1.5 && Math.abs(a.y - b.y) < 1.5 && Math.abs(a.width - b.width) < 1.5 && Math.abs(a.height - b.height) < 1.5

/**
 * Where a registered element is once it has stopped moving (screens slide in and cards fade
 * up, so an early measurement points at the wrong spot). Null if it never shows up.
 */
async function measureSettled(id: string, isCancelled: () => boolean, tries = 16): Promise<Rect | null> {
  let previous: Rect | null = null
  for (let i = 0; i < tries && !isCancelled(); i++) {
    const current = await measureTarget(id)
    if (current && previous && near(current, previous)) return current
    previous = current
    await wait(current ? 90 : 160)
  }
  return null
}

/** The dimmed screen, the lit-up hole and the note. Mounted once at the top of the app. */
export function TourOverlay() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const pathname = usePathname()
  const [session, setSession] = useState(getTourSession())
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [busy, setBusy] = useState(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [cardHeight, setCardHeight] = useState(180)
  const direction = useRef(1)
  const pathRef = useRef(pathname)
  const container = useRef<View>(null)
  const pulse = useRef(new Animated.Value(0)).current
  // The hole, animated so the light glides from one element to the next instead of jumping.
  const hx = useRef(new Animated.Value(0)).current
  const hy = useRef(new Animated.Value(0)).current
  const hw = useRef(new Animated.Value(0)).current
  const hh = useRef(new Animated.Value(0)).current
  const cardFade = useRef(new Animated.Value(0)).current

  pathRef.current = pathname

  useEffect(() => subscribeTourSession(() => setSession(getTourSession())), [])
  useEffect(
    () =>
      subscribeTourStart(() => {
        direction.current = 1
        setRect(null)
        setIndex(0)
        setActive(true)
      }),
    [],
  )

  const steps = session?.role === 'technician' ? TECHNICIAN_STEPS : CUSTOMER_STEPS
  const tabs = session?.role === 'technician' ? TECHNICIAN_TABS : CUSTOMER_TABS
  const step = steps[Math.min(index, steps.length - 1)]
  const last = index >= steps.length - 1

  const close = useCallback(() => {
    setActive(false)
    setRect(null)
    const current = getTourSession()
    if (current) AsyncStorage.setItem(keyFor(current.userId), '1').catch(() => {})
  }, [])

  useEffect(() => {
    if (!active) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [active, pulse])

  /** Moves the hole; with no element it closes to a point in the middle, so the whole screen is dimmed. */
  const moveHole = useCallback(
    (to: Rect | null, duration = MOVE_MS) => {
      const { width: W, height: H } = size
      const target = to
        ? {
            x: Math.max(to.x - PAD, 0),
            y: Math.max(to.y - PAD, 0),
            width: Math.min(to.width + PAD * 2, W),
            height: Math.min(to.height + PAD * 2, H),
          }
        : { x: W / 2, y: H / 2, width: 0, height: 0 }
      const ease = Easing.out(Easing.cubic)
      return new Promise<void>((resolve) =>
        Animated.parallel([
          Animated.timing(hx, { toValue: target.x, duration, easing: ease, useNativeDriver: false }),
          Animated.timing(hy, { toValue: target.y, duration, easing: ease, useNativeDriver: false }),
          Animated.timing(hw, { toValue: target.width, duration, easing: ease, useNativeDriver: false }),
          Animated.timing(hh, { toValue: target.height, duration, easing: ease, useNativeDriver: false }),
        ]).start(() => resolve()),
      )
    },
    [size, hx, hy, hw, hh],
  )

  // Go to the step's screen, wait for it to settle, scroll the element into view, then light it up.
  useEffect(() => {
    if (!active || size.width === 0) return
    let cancelled = false
    const isCancelled = () => cancelled
    const { width: W, height: H } = size
    setBusy(true)
    Animated.timing(cardFade, { toValue: 0, duration: 120, useNativeDriver: true }).start()

    void (async () => {
      const leaving = !!step.route && pathRef.current !== step.route
      if (leaving) {
        // Close the light before the screen changes, so it never sits on the wrong screen.
        await moveHole(null, 160)
        if (cancelled) return
        try {
          router.navigate(step.route as never)
        } catch {
          // The note still shows, centred.
        }
        await wait(380)
      }

      const isTabScreen = !!step.route && tabs.includes(step.route.slice(1))
      const top = insets.top + 12
      const bottom = H - (isTabScreen ? TAB_BAR + insets.bottom : insets.bottom) - 12
      const toOverlay = async (r: Rect) => {
        const origin = await new Promise<{ x: number; y: number }>((resolve) => {
          if (!container.current) return resolve({ x: 0, y: 0 })
          container.current.measureInWindow((x, y) => resolve({ x, y }))
        })
        return { ...r, x: r.x - origin.x, y: r.y - origin.y }
      }

      let found: Rect | null = null
      if (step.target?.startsWith('tab:')) {
        const i = tabs.indexOf(step.target.slice(4))
        if (i >= 0) {
          const barHeight = TAB_BAR + insets.bottom
          const width = W / tabs.length
          found = { x: i * width, y: H - barHeight, width, height: barHeight }
        }
      } else if (step.target) {
        let measured = await measureSettled(step.target, isCancelled)
        if (measured) {
          let r = await toOverlay(measured)
          const fits = r.y >= top && r.y + r.height <= bottom
          if (!fits && step.route) {
            // Below the fold or scrolled past: bring it to the upper part of the screen,
            // leaving room for the note underneath.
            const goal = top + Math.max(0, Math.min((bottom - top) * 0.22, bottom - top - r.height))
            if (await scrollTargetTo(step.route, measured.y, measured.y - (r.y - goal))) {
              await wait(120)
              measured = await measureSettled(step.target, isCancelled)
              if (measured) r = await toOverlay(measured)
            }
          }
          if (measured) found = r
        }
        // Mostly hidden (under the tab bar or off screen) counts as not found.
        if (found && (found.y + found.height < top || found.y > bottom)) found = null
      }
      if (cancelled) return

      if (!found && step.target && step.optional) {
        // Not on this screen right now (for example the customer already has a plan): move on.
        const nextIndex = index + direction.current
        if (nextIndex < 0) setIndex(0)
        else if (nextIndex >= steps.length) close()
        else setIndex(nextIndex)
        return
      }
      setRect(found)
      await moveHole(found)
      if (cancelled) return
      setBusy(false)
      Animated.timing(cardFade, { toValue: 1, duration: 180, useNativeDriver: true }).start()
    })()

    return () => {
      cancelled = true
    }
    // The step changes drive this; the other values are read when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, size.width, size.height])

  function next() {
    if (busy) return
    direction.current = 1
    if (last) return close()
    setIndex(index + 1)
  }

  function back() {
    if (busy || index === 0) return
    direction.current = -1
    setIndex(index - 1)
  }

  if (!active || !session) return null

  const { height: H } = size
  const hole = rect ? { y: Math.max(rect.y - PAD, 0), height: rect.height + PAD * 2 } : null

  // The note goes under the light when it fits there, otherwise above it.
  const below = hole ? hole.y + hole.height + 12 + cardHeight < H - insets.bottom : true
  const cardPosition = hole
    ? below
      ? { top: hole.y + hole.height + 12 }
      : { bottom: Math.max(H - hole.y + 12, insets.bottom + 12) }
    : { top: Math.max(H / 2 - cardHeight / 2, insets.top + 12) }

  const holeBottom = Animated.add(hy, hh)
  const holeRight = Animated.add(hx, hw)

  return (
    <View
      ref={container}
      collapsable={false}
      style={styles.overlay}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <Animated.View style={[styles.dim, { top: 0, left: 0, right: 0, height: hy }]} />
      <Animated.View style={[styles.dim, { top: holeBottom, left: 0, right: 0, bottom: 0 }]} />
      <Animated.View style={[styles.dim, { top: hy, left: 0, width: hx, height: hh }]} />
      <Animated.View style={[styles.dim, { top: hy, left: holeRight, right: 0, height: hh }]} />
      {rect ? (
        <>
          <Animated.View pointerEvents="none" style={[styles.ring, { top: hy, left: hx, width: hw, height: hh }]}>
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.ringGlow,
                { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
              ]}
            />
          </Animated.View>
          <Animated.View style={{ position: 'absolute', top: hy, left: hx, width: hw, height: hh }}>
            <Pressable
              onPress={next}
              accessibilityRole="button"
              accessibilityLabel={`${step.title}. Tap to continue.`}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </>
      ) : null}

      <Animated.View
        pointerEvents={busy ? 'none' : 'auto'}
        onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        style={[
          styles.card,
          cardPosition,
          {
            opacity: cardFade,
            transform: [{ translateY: cardFade.interpolate({ inputRange: [0, 1], outputRange: [below ? 8 : -8, 0] }) }],
          },
        ]}
      >
        <View style={styles.cardHead}>
          <Text style={styles.stepCount}>
            {index + 1} / {steps.length}
          </Text>
          <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
            <Text style={styles.skip}>Skip tour</Text>
          </Pressable>
        </View>
        <Text style={styles.cardTitle}>{step.title}</Text>
        <Text style={styles.cardText}>{step.text}</Text>
        <View style={styles.cardRow}>
          <Pressable
            onPress={back}
            disabled={index === 0}
            style={[styles.back, index === 0 && { opacity: 0.35 }]}
            accessibilityRole="button"
          >
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Pressable onPress={next} style={styles.next} accessibilityRole="button">
            <Text style={styles.nextText}>{last ? 'Finish' : 'Next'}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  )
}

type Row = { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }

/** App tour and the legal pages, as a proper section on the Profile screens. */
export function HelpAndLegal() {
  const open = (path: string) => Linking.openURL(`${API_BASE_URL}${path}`).catch(() => {})
  const rows: Row[] = [
    { icon: 'compass-outline', label: 'App tour', onPress: showAppTourAgain },
    { icon: 'document-text-outline', label: 'Terms and Conditions', onPress: () => open('/terms') },
    { icon: 'shield-checkmark-outline', label: 'Privacy Policy', onPress: () => open('/privacy') },
    { icon: 'cafe-outline', label: 'Cookie Notice', onPress: () => open('/cookies') },
  ]
  return (
    <View style={styles.legalCard} ref={tourRef('prof-help')} collapsable={false}>
      <Text style={styles.legalHeading}>HELP &amp; LEGAL</Text>
      {rows.map((row, i) => (
        <Pressable
          key={row.label}
          onPress={row.onPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.legalRow, i > 0 && styles.legalRowBorder, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name={row.icon} size={20} color={colors.accent} />
          <Text style={styles.legalLabel}>{row.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 9999 },
  dim: { position: 'absolute', backgroundColor: 'rgba(3, 8, 14, 0.82)' },
  ring: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  ringGlow: {
    margin: -4,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    gap: 8,
    padding: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.panel,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepCount: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  skip: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  cardText: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  back: { paddingVertical: 11, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  backText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  next: { paddingVertical: 11, paddingHorizontal: 28, borderRadius: 12, backgroundColor: colors.accent },
  nextText: { color: '#04101A', fontSize: 14, fontWeight: '800' },
  legalCard: { marginTop: 18, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  legalHeading: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
  legalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  legalRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  legalLabel: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
})
