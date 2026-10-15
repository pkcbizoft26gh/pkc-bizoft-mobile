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
        // A short wait so the Home screen is drawn before the first spotlight.
        if (live && !seen) timer = setTimeout(startTour, 1200)
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

/** The dimmed screen, the lit-up hole and the note. Mounted once at the top of the app. */
export function TourOverlay() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const pathname = usePathname()
  const [session, setSession] = useState(getTourSession())
  const [active, setActive] = useState(false)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const direction = useRef(1)
  const pathRef = useRef(pathname)
  const container = useRef<View>(null)
  const pulse = useRef(new Animated.Value(0)).current

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

  // Go to the step's screen, wait for it to draw, then find the element to light up.
  useEffect(() => {
    if (!active || size.width === 0) return
    let cancelled = false
    setRect(null)

    void (async () => {
      if (step.route && pathRef.current !== step.route) {
        try {
          router.navigate(step.route as never)
        } catch {
          // The note still shows, centred.
        }
      }

      let found: Rect | null = null
      if (step.target?.startsWith('tab:')) {
        const i = tabs.indexOf(step.target.slice(4))
        if (i >= 0) {
          const barHeight = 62 + insets.bottom
          const width = size.width / tabs.length
          found = { x: i * width, y: size.height - barHeight, width, height: barHeight }
        }
        await new Promise((r) => setTimeout(r, step.route && pathRef.current !== step.route ? 450 : 120))
      } else if (step.target) {
        const wait = step.route && pathRef.current !== step.route ? 500 : 150
        await new Promise((r) => setTimeout(r, wait))
        for (let attempt = 0; attempt < 6 && !cancelled && !found; attempt++) {
          const measured = await measureTarget(step.target)
          if (measured && measured.y >= 0 && measured.y + measured.height <= size.height + 4) {
            const origin = await new Promise<{ x: number; y: number }>((resolve) => {
              if (!container.current) return resolve({ x: 0, y: 0 })
              container.current.measureInWindow((x, y) => resolve({ x, y }))
            })
            found = { ...measured, x: measured.x - origin.x, y: measured.y - origin.y }
          } else {
            await new Promise((r) => setTimeout(r, 250))
          }
        }
      } else {
        await new Promise((r) => setTimeout(r, step.route && pathRef.current !== step.route ? 450 : 120))
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
    })()

    return () => {
      cancelled = true
    }
    // The step changes drive this; the other values are read when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index, size.width, size.height])

  function next() {
    direction.current = 1
    if (last) return close()
    setIndex(index + 1)
  }

  function back() {
    if (index === 0) return
    direction.current = -1
    setIndex(index - 1)
  }

  if (!active || !session) return null

  const { width: W, height: H } = size
  const hole = rect
    ? {
        x: Math.max(rect.x - PAD, 0),
        y: Math.max(rect.y - PAD, 0),
        width: Math.min(rect.width + PAD * 2, W),
        height: Math.min(rect.height + PAD * 2, H),
      }
    : null

  const below = hole ? hole.y + hole.height + 12 + 170 < H : true
  const cardPosition = hole
    ? below
      ? { top: hole.y + hole.height + 12 }
      : { bottom: H - hole.y + 12 }
    : { top: H / 2 - 90 }

  return (
    <View
      ref={container}
      collapsable={false}
      style={styles.overlay}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {hole ? (
        <>
          <View style={[styles.dim, { top: 0, left: 0, right: 0, height: hole.y }]} />
          <View style={[styles.dim, { top: hole.y + hole.height, left: 0, right: 0, bottom: 0 }]} />
          <View style={[styles.dim, { top: hole.y, left: 0, width: hole.x, height: hole.height }]} />
          <View style={[styles.dim, { top: hole.y, left: hole.x + hole.width, right: 0, height: hole.height }]} />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              { top: hole.y, left: hole.x, width: hole.width, height: hole.height },
              { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) },
            ]}
          />
          <Pressable
            onPress={next}
            accessibilityRole="button"
            accessibilityLabel={`${step.title}. Tap to continue.`}
            style={{ position: 'absolute', top: hole.y, left: hole.x, width: hole.width, height: hole.height }}
          />
        </>
      ) : (
        <View style={[styles.dim, { top: 0, left: 0, right: 0, bottom: 0 }]} />
      )}

      <View style={[styles.card, cardPosition]}>
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
      </View>
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
