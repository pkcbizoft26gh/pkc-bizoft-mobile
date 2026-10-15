import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'

import { API_BASE_URL } from '@/lib/api'
import { colors, radii } from '@/constants/theme'

// A hands-on practice tour. The user walks through practice versions of the real
// screens and taps every button, so they learn the flow without sending anything.
// It opens once after sign-in and can be replayed from Profile -> App tour.

type Block =
  | { t: 'title'; text: string }
  | { t: 'text'; text: string }
  | { t: 'row'; label: string; value: string }
  | { t: 'pill'; text: string }
  | { t: 'btn'; id: string; label: string; icon: keyof typeof Ionicons.glyphMap; note: string }

type Step = {
  header: string
  blocks: Block[]
  instruction: string
  /** Buttons to tap. An array inside means "any one of these". */
  need: (string | string[])[]
}

const btn = (id: string, label: string, icon: keyof typeof Ionicons.glyphMap, note: string): Block => ({ t: 'btn', id, label, icon, note })

const CUSTOMER_STEPS: Step[] = [
  {
    header: 'Home',
    instruction: 'Tap each button to see what it does.',
    need: ['bell', 'apply'],
    blocks: [
      { t: 'title', text: 'Hi, Prinx' },
      { t: 'pill', text: 'No plan yet' },
      btn('bell', 'Notifications', 'notifications-outline', 'New updates show here, and as a banner at the top while the app is open. Tap the banner to open it.'),
      btn('apply', 'Apply for a Plan', 'wifi-outline', 'Starts your application. You choose a speed, then pay.'),
    ],
  },
  {
    header: 'Choose a plan',
    instruction: 'Open Compare plans, then pick any speed.',
    need: ['compare', ['p50', 'p80', 'p120', 'p200']],
    blocks: [
      { t: 'text', text: 'Pick the speed that fits your home.' },
      btn('compare', 'Compare plans', 'git-compare-outline', 'Shows every plan side by side with its price.'),
      btn('p50', '50 Mbps', 'speedometer-outline', 'Good for a few phones and light streaming.'),
      btn('p80', '80 Mbps', 'speedometer-outline', 'A comfortable step up for a busy household.'),
      btn('p120', '120 Mbps', 'speedometer-outline', 'For many devices at once.'),
      btn('p200', '200 Mbps', 'speedometer-outline', 'The fastest plan. Speeds are maximums, real speed can vary.'),
    ],
  },
  {
    header: 'Pay for your plan',
    instruction: 'Try every button here. This is only practice.',
    need: [['gcash', 'bank', 'cash'], 'qr', 'ref', 'receipt'],
    blocks: [
      { t: 'row', label: 'Plan', value: 'Your chosen speed' },
      { t: 'row', label: 'Installation fee', value: 'PHP 750' },
      { t: 'text', text: 'You pay the plan and the installation fee together.' },
      btn('gcash', 'GCash', 'phone-portrait-outline', 'Pay by GCash. The app shows a QR you can save to your gallery.'),
      btn('bank', 'Bank transfer', 'business-outline', 'Pay by bank and enter the bank name.'),
      btn('cash', 'Cash', 'cash-outline', 'Pay cash where the option is offered.'),
      btn('qr', 'Save GCash QR', 'qr-code-outline', 'Saves the QR to your phone so you can pay from the GCash app.'),
      btn('ref', 'Enter reference number', 'create-outline', 'Type the reference number exactly as shown on your receipt.'),
      btn('receipt', 'Upload receipt', 'image-outline', 'Attach a clear screenshot of your receipt. Accounting compares it with the reference number.'),
    ],
  },
  {
    header: 'Send it',
    instruction: 'Tap Submit payment.',
    need: ['submit'],
    blocks: [
      { t: 'text', text: 'Check your details, then send.' },
      btn('submit', 'Submit payment', 'paper-plane-outline', 'Sent to Accounting. In the real app you would see "Waiting for Accounting" and get a notice when it is checked.'),
    ],
  },
  {
    header: 'Follow your installation',
    instruction: 'Tap Refresh, then Cancel request to see both.',
    need: ['refresh', 'cancel'],
    blocks: [
      { t: 'row', label: 'Payment checked', value: 'Done' },
      { t: 'row', label: 'Technician assigned', value: 'Done' },
      { t: 'row', label: 'Technician arrived', value: 'Next' },
      { t: 'row', label: 'Completed', value: 'Waiting' },
      btn('refresh', 'Refresh', 'refresh-outline', 'Reloads the progress. It also updates by itself.'),
      btn('cancel', 'Cancel request', 'close-circle-outline', 'Withdraw a request that has not been started yet.'),
    ],
  },
  {
    header: 'Plan & Bills',
    instruction: 'Tap Pay now and View receipt.',
    need: ['pay', 'viewreceipt'],
    blocks: [
      { t: 'row', label: 'Pay by', value: 'Last day of the month' },
      { t: 'row', label: 'Grace period', value: 'Until the 4th of next month' },
      { t: 'row', label: 'Disconnection', value: 'The 5th, if unpaid' },
      btn('pay', 'Pay now', 'card-outline', 'Opens the same payment steps you just practiced for your monthly bill.'),
      btn('viewreceipt', 'View receipt', 'receipt-outline', 'Shows a receipt for each confirmed payment and lets you share it as a PDF.'),
    ],
  },
  {
    header: 'Requests & Help',
    instruction: 'Tap all three buttons.',
    need: ['help', 'report', 'chat'],
    blocks: [
      btn('help', 'Help center', 'help-buoy-outline', 'Quick fixes for no or slow internet. Try them before reporting.'),
      btn('report', 'Report an Issue', 'construct-outline', 'Describe the problem and a technician is assigned.'),
      btn('chat', 'Chat with technician', 'chatbubbles-outline', 'Message the technician on your request.'),
    ],
  },
  {
    header: 'Referrals',
    instruction: 'Tap all three buttons.',
    need: ['share', 'enter', 'withdraw'],
    blocks: [
      btn('share', 'Share my code', 'share-social-outline', 'Send your code to a friend. You earn when they subscribe to a plan and are installed.'),
      btn('enter', 'Were you referred? Enter code', 'person-add-outline', 'If a friend told you about us, enter their code before your installation is done.'),
      btn('withdraw', 'Withdraw rewards', 'wallet-outline', 'Ask Accounting to send your rewards to GCash or a bank account.'),
    ],
  },
  {
    header: 'Profile',
    instruction: 'Tap the help bot and the rating, then Sign out.',
    need: ['bot', 'rate', 'out'],
    blocks: [
      btn('bot', 'Help bot', 'chatbubble-ellipses-outline', 'The round button on screen. Ask it about plans, bills, GCash and repairs. You can also ask it to change your rating.'),
      btn('rate', 'Rate our service', 'star-outline', 'You can rate us once. Ask the help bot if you want to change it.'),
      btn('out', 'Sign out', 'log-out-outline', 'The app asks "Are you sure?" first, so you cannot sign out by accident.'),
    ],
  },
]

const TECHNICIAN_STEPS: Step[] = [
  {
    header: 'Jobs',
    instruction: 'Accept a job, then choose how you will work it.',
    need: ['accept', ['solo', 'team']],
    blocks: [
      { t: 'text', text: 'Nearest open jobs come first. You can hold up to 3 at once.' },
      btn('accept', 'Accept job', 'checkmark-circle-outline', 'The job becomes yours. Other technicians no longer see it as open.'),
      btn('solo', 'Work solo', 'person-outline', 'You handle the whole job alone.'),
      btn('team', 'Team up', 'people-outline', 'Ask others to join. The lead accepts or declines on Crew requests.'),
    ],
  },
  {
    header: 'At the house',
    instruction: 'Tap both buttons.',
    need: ['arrived', 'route'],
    blocks: [
      btn('route', 'Route', 'navigate-outline', 'Opens the route to the customer pin so you can find the house.'),
      btn('arrived', 'I have arrived', 'location-outline', 'Starts the job and lets the customer know you are there.'),
    ],
  },
  {
    header: 'Checklist',
    instruction: 'Tick every item and scan the serial.',
    need: ['c1', 'c2', 'c3', 'serial'],
    blocks: [
      btn('c1', 'Modem placed', 'checkbox-outline', 'Every item must be ticked before you can finish.'),
      btn('c2', 'Cable tested', 'checkbox-outline', 'Confirms the line works.'),
      btn('c3', 'Wi-Fi checked with customer', 'checkbox-outline', 'Show the customer the connection.'),
      btn('serial', 'Scan modem serial', 'barcode-outline', 'Scan or type the serial number on the modem label.'),
    ],
  },
  {
    header: 'Evidence',
    instruction: 'Tap before, after and signature.',
    need: ['before', 'after', ['sign', 'remote']],
    blocks: [
      btn('before', 'Before photo', 'camera-outline', 'Photo of the site before you start.'),
      btn('after', 'After photo', 'camera-outline', 'Photo of the finished work.'),
      btn('sign', 'Customer signs now', 'create-outline', 'The customer draws their signature on your phone. It is required.'),
      btn('remote', 'Customer not here: ask in app', 'phone-portrait-outline', 'The customer gets a notice, checks your photos and signs in their app.'),
    ],
  },
  {
    header: 'Finish',
    instruction: 'Tap Mark completed.',
    need: ['done'],
    blocks: [
      { t: 'text', text: 'No signal? Your notes are saved and sent when you are online.' },
      btn('done', 'Mark completed', 'flag-outline', 'Closes the job. You must have tapped "I have arrived" first.'),
    ],
  },
  {
    header: 'Materials & Profile',
    instruction: 'Tap all three buttons.',
    need: ['use', 'handback', 'out'],
    blocks: [
      btn('use', 'Use item on job', 'cube-outline', 'Takes the item from your truck stock for this job.'),
      btn('handback', 'Hand job back', 'return-up-back-outline', 'Return a job you cannot finish so someone else can take it.'),
      btn('out', 'Sign out', 'log-out-outline', 'The app asks "Are you sure?" first.'),
    ],
  },
]

const listeners = new Set<() => void>()

/** Opens the tour again (used by the Profile button). */
export function showAppTourAgain() {
  listeners.forEach((fn) => fn())
}

const keyFor = (userId: string) => `app-tour-seen-v2-${userId}`

function needIds(step: Step) {
  return step.need.map((n) => (Array.isArray(n) ? n : [n]))
}

function done(step: Step, tapped: Set<string>) {
  return needIds(step).every((group) => group.some((id) => tapped.has(id)))
}

export function AppTour({ userId, role }: { userId: string | null; role: 'customer' | 'technician' | null }) {
  const insets = useSafeAreaInsets()
  const [visible, setVisible] = useState(false)
  const [index, setIndex] = useState(0)
  const [tapped, setTapped] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const steps = role === 'technician' ? TECHNICIAN_STEPS : CUSTOMER_STEPS
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!userId || !role) return
    let live = true
    AsyncStorage.getItem(keyFor(userId))
      .then((seen) => {
        if (live && !seen) setVisible(true)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [userId, role])

  useEffect(() => {
    const open = () => {
      setIndex(0)
      setTapped(new Set())
      setNote('')
      setVisible(true)
    }
    listeners.add(open)
    return () => {
      listeners.delete(open)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [visible, pulse])

  const close = useCallback(() => {
    setVisible(false)
    if (userId) AsyncStorage.setItem(keyFor(userId), '1').catch(() => {})
  }, [userId])

  const step = steps[Math.min(index, steps.length - 1)]
  const complete = done(step, tapped)
  const last = index >= steps.length - 1
  const wanted = useMemo(() => new Set(needIds(step).flat()), [step])
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,229,255,0.25)', 'rgba(0,229,255,1)'] })

  function press(block: Extract<Block, { t: 'btn' }>) {
    setNote(block.note)
    setTapped((prev) => new Set(prev).add(block.id))
  }

  function next() {
    if (last) return close()
    setIndex(index + 1)
    setTapped(new Set())
    setNote('')
  }

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close}>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.practice}>PRACTICE MODE</Text>
            <Text style={styles.practiceSub}>Nothing you tap here is sent.</Text>
          </View>
          <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
            <Text style={styles.skip}>Skip tour</Text>
          </Pressable>
        </View>

        <View style={styles.progressRow}>
          {steps.map((s, i) => (
            <View key={s.header} style={[styles.dot, i <= index && styles.dotOn]} />
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.phone}>
            <Text style={styles.screenHeader}>{step.header}</Text>
            {step.blocks.map((block, i) => {
              if (block.t === 'title') return <Text key={i} style={styles.title}>{block.text}</Text>
              if (block.t === 'text') return <Text key={i} style={styles.text}>{block.text}</Text>
              if (block.t === 'pill')
                return (
                  <View key={i} style={styles.pill}>
                    <Text style={styles.pillText}>{block.text}</Text>
                  </View>
                )
              if (block.t === 'row')
                return (
                  <View key={i} style={styles.row}>
                    <Text style={styles.rowLabel}>{block.label}</Text>
                    <Text style={styles.rowValue}>{block.value}</Text>
                  </View>
                )
              const isDone = tapped.has(block.id)
              const needed = wanted.has(block.id) && !isDone
              return (
                <Animated.View
                  key={block.id}
                  style={[styles.btnWrap, needed ? { borderColor: glow } : isDone ? styles.btnDone : styles.btnIdle]}
                >
                  <Pressable onPress={() => press(block)} style={styles.btnInner} accessibilityRole="button" accessibilityLabel={block.label}>
                    <Ionicons name={isDone ? 'checkmark-circle' : block.icon} size={20} color={isDone ? colors.success : colors.accent} />
                    <Text style={styles.btnLabel}>{block.label}</Text>
                  </Pressable>
                </Animated.View>
              )
            })}
          </View>
        </ScrollView>

        <View style={styles.coach}>
          <Text style={styles.coachStep}>
            Step {index + 1} of {steps.length}
          </Text>
          <Text style={styles.coachText}>{note || step.instruction}</Text>
          <View style={styles.coachRow}>
            <Pressable
              onPress={() => {
                if (index > 0) {
                  setIndex(index - 1)
                  setTapped(new Set())
                  setNote('')
                }
              }}
              disabled={index === 0}
              style={[styles.back, index === 0 && { opacity: 0.35 }]}
              accessibilityRole="button"
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <Pressable onPress={next} disabled={!complete} style={[styles.next, !complete && { opacity: 0.4 }]} accessibilityRole="button">
              <Text style={styles.nextText}>{last ? 'Finish' : 'Next'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
    <View style={styles.legalCard}>
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
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  practice: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  practiceSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  skip: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  progressRow: { flexDirection: 'row', gap: 5, marginBottom: 12 },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent },
  scroll: { paddingBottom: 12 },
  phone: { gap: 10, padding: 16, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  screenHeader: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 2 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  text: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(0,229,255,0.12)' },
  pillText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { color: colors.muted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  btnWrap: { borderRadius: 12, borderWidth: 2 },
  btnIdle: { borderColor: colors.border },
  btnDone: { borderColor: colors.success },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  btnLabel: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  coach: { gap: 8, padding: 14, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.panel },
  coachStep: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  coachText: { color: colors.text, fontSize: 15, lineHeight: 21, minHeight: 44 },
  coachRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  backText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  next: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12, backgroundColor: colors.accent },
  nextText: { color: '#04101A', fontSize: 14, fontWeight: '800' },
  legalCard: { marginTop: 18, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  legalHeading: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
  legalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  legalRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  legalLabel: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
})
