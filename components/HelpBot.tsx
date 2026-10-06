import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

import { colors, radii, shadows } from '@/constants/theme'
import { RobotMark } from '@/components/RobotMark'

// A small offline help bot for customers. It answers common questions from a
// fixed list (no server, no API key) and links to the right screen. Anything it
// can't answer is pointed at Requests & Help, where staff reply.

type Topic = {
  id: string
  keywords: string[]
  answer: string
  action?: { label: string; route: '/payment' | '/requests' | '/referrals' | '/profile' | '/customer' }
}

const TOPICS: Topic[] = [
  {
    id: 'plans',
    keywords: ['plan', 'plans', 'price', 'prices', 'cost', 'how much', 'speed', 'mbps', 'monthly', 'rate', 'package', '750', '1000', '1500', '2000'],
    answer:
      'Our plans start at G1_P750 (₱750/month). The others are G1_P1000 (₱1,000), G1_P1500 (₱1,500) and G1_P2000 (₱2,000). You can see and choose them in the Payment tab.',
    action: { label: 'Open Payment', route: '/payment' },
  },
  {
    id: 'gcash',
    keywords: ['gcash', 'qr', 'scan', 'pay', 'paying', 'how to pay', 'payment method', 'instapay', 'send money'],
    answer:
      'To pay with GCash: open Payment, choose a plan, pick GCash, then tap "Pay with GCash" and scan the QR with your GCash app. Pay the exact amount shown. After paying, come back, enter your GCash number and the reference number, upload the receipt, and submit.',
    action: { label: 'Open Payment', route: '/payment' },
  },
  {
    id: 'verify',
    keywords: ['verify', 'verified', 'verification', 'confirm', 'confirmed', 'pending', 'not yet', 'paid already', 'received', 'status', 'approved', 'how long'],
    answer:
      'Payments are checked by hand. Accounting compares your reference number and receipt with the money received, then verifies it. Until then your request shows as pending in Payment. Pull down on the Payment screen to refresh the status.',
    action: { label: 'Check my payment', route: '/payment' },
  },
  {
    id: 'receipt',
    keywords: ['receipt', 'proof', 'reference', 'reference number', 'upload', 'screenshot'],
    answer:
      'Upload a clear screenshot of your GCash or bank receipt and type the reference number exactly as shown on it. Accounting uses both to verify your payment, so they must match.',
    action: { label: 'Open Payment', route: '/payment' },
  },
  {
    id: 'change',
    keywords: ['change plan', 'upgrade', 'downgrade', 'switch', 'different plan', 'new plan', 'cancel plan', 'remove plan'],
    answer:
      'You can switch plans in the Payment tab. A paid plan change starts after your current billing period ends. If you scheduled the wrong plan, remove it from the scheduled-change card and pick another.',
    action: { label: 'Open Payment', route: '/payment' },
  },
  {
    id: 'bill',
    keywords: ['bill', 'billing', 'due', 'balance', 'outstanding', 'overdue', 'disconnect', 'disconnected', 'reminder', 'late'],
    answer:
      'Your balance and bills are in the Payment tab. You get a reminder 5 days before a bill is due or your plan period ends. If a bill is overdue, pay it and submit your proof so Accounting can verify it.',
    action: { label: 'See my bills', route: '/payment' },
  },
  {
    id: 'repair',
    keywords: ['repair', 'slow', 'no internet', 'no connection', 'not working', 'broken', 'problem', 'issue', 'technician', 'down', 'router', 'wifi', 'wi-fi', 'disconnected'],
    answer:
      'Sorry about the trouble. Open Requests & Help, choose Repair / Issue, and describe what is happening. A technician will follow up. Restarting your router for a minute is worth trying first.',
    action: { label: 'Report an issue', route: '/requests' },
  },
  {
    id: 'referral',
    keywords: ['referral', 'refer', 'reward', 'invite', 'friend', 'code', 'earn'],
    answer:
      'Share your referral code with a friend. The reward is added to your balance once your referral is installed and their payment is confirmed. Signing up alone does not count.',
    action: { label: 'Open Referrals', route: '/referrals' },
  },
  {
    id: 'account',
    keywords: ['account', 'profile', 'password', 'email', 'number', 'mobile', 'address', 'name', 'update'],
    answer:
      'Your account details are in the Profile tab. If something is wrong and you cannot change it there, send a request in Requests & Help and staff will update it.',
    action: { label: 'Open Profile', route: '/profile' },
  },
  {
    id: 'human',
    keywords: ['human', 'person', 'staff', 'agent', 'talk', 'call', 'contact', 'support', 'help me', 'speak'],
    answer:
      'For anything I cannot answer, send a message in Requests & Help. Staff will see it and get back to you.',
    action: { label: 'Open Requests & Help', route: '/requests' },
  },
]

const SUGGESTIONS = [
  { label: 'How do I pay with GCash?', topic: 'gcash' },
  { label: 'What plans are there?', topic: 'plans' },
  { label: 'Is my payment verified?', topic: 'verify' },
  { label: 'Report a problem', topic: 'repair' },
]

const FALLBACK =
  "I'm not sure about that one. I can help with plans, paying with GCash, payment status, bills, repairs and referrals. For anything else, send a message in Requests & Help and staff will reply."

type Message = {
  id: number
  from: 'bot' | 'me'
  text: string
  action?: Topic['action']
}

function answerFor(input: string): Topic | null {
  const text = input.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ')
  let best: { topic: Topic; score: number } | null = null

  for (const topic of TOPICS) {
    let score = 0
    for (const keyword of topic.keywords) {
      if (text.includes(keyword)) score += keyword.includes(' ') ? 3 : 1
    }
    if (score > 0 && (!best || score > best.score)) best = { topic, score }
  }

  return best?.topic ?? null
}

const GREETING: Message = {
  id: 0,
  from: 'bot',
  text: 'Hi! I’m the PKC help bot. Ask me about plans, GCash payments, bills or repairs, or tap a question below.',
}

export function HelpBot() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const scroller = useRef<ScrollView>(null)
  const nextId = useRef(1)

  // Gentle pulse on the launcher so customers notice it.
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  const ring = useMemo(
    () => ({
      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
      transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
    }),
    [pulse],
  )

  // The launcher can be dragged anywhere, so it never has to cover a button.
  // It snaps to the nearest side edge and stays where the customer leaves it.
  const { width, height } = useWindowDimensions()
  const SIZE = 48
  const MARGIN = 10
  const TOP_LIMIT = 70
  const BOTTOM_LIMIT = 96 // clears the tab bar
  const position = useRef(
    new Animated.ValueXY({ x: width - SIZE - MARGIN, y: height - SIZE - BOTTOM_LIMIT - 70 }),
  ).current
  const current = useRef({ x: width - SIZE - MARGIN, y: height - SIZE - BOTTOM_LIMIT - 70 })
  const dragging = useRef(false)

  useEffect(() => {
    const id = position.addListener((value) => {
      current.current = value
    })
    return () => position.removeListener(id)
  }, [position])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragging.current = false
          position.setOffset({ x: current.current.x, y: current.current.y })
          position.setValue({ x: 0, y: 0 })
        },
        onPanResponderMove: (_event, gesture) => {
          if (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6) dragging.current = true
          position.setValue({ x: gesture.dx, y: gesture.dy })
        },
        onPanResponderRelease: () => {
          position.flattenOffset()

          if (!dragging.current) {
            setOpen(true)
            return
          }

          const x = current.current.x + SIZE / 2 < width / 2 ? MARGIN : width - SIZE - MARGIN
          const y = Math.min(Math.max(current.current.y, TOP_LIMIT), height - SIZE - BOTTOM_LIMIT)
          Animated.spring(position, {
            toValue: { x, y },
            friction: 7,
            tension: 90,
            useNativeDriver: false,
          }).start()
        },
      }),
    [position, width, height],
  )

  function push(message: Omit<Message, 'id'>) {
    setMessages((current) => [...current, { ...message, id: nextId.current++ }])
  }

  function ask(question: string, topicId?: string) {
    const trimmed = question.trim()
    if (!trimmed) return

    push({ from: 'me', text: trimmed })
    setText('')

    const topic = (topicId ? TOPICS.find((t) => t.id === topicId) : null) ?? answerFor(trimmed)
    setTimeout(() => {
      push(topic ? { from: 'bot', text: topic.answer, action: topic.action } : { from: 'bot', text: FALLBACK, action: { label: 'Open Requests & Help', route: '/requests' } })
    }, 350)
  }

  useEffect(() => {
    const timer = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60)
    return () => clearTimeout(timer)
  }, [messages, open])

  function go(route: NonNullable<Topic['action']>['route']) {
    setOpen(false)
    router.push(route)
  }

  return (
    <>
      <Animated.View
        {...panResponder.panHandlers}
        accessibilityRole="button"
        accessibilityLabel="Open help bot. Drag to move."
        style={[styles.launcher, { transform: position.getTranslateTransform() }]}
      >
        <Animated.View pointerEvents="none" style={[styles.ring, ring]} />
        <Ionicons name="chatbubble-ellipses" size={22} color={colors.bg} />
      </Animated.View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
          <Pressable style={styles.dismiss} onPress={() => setOpen(false)} />

          <View style={styles.sheet}>
            <View style={styles.header}>
              <RobotMark small />
              <View style={styles.headerText}>
                <Text style={styles.title}>PKC Help Bot</Text>
                <Text style={styles.subtitle}>Quick answers, any time</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} style={styles.close} accessibilityLabel="Close help bot">
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView ref={scroller} style={styles.chat} contentContainerStyle={styles.chatContent} keyboardShouldPersistTaps="handled">
              {messages.map((message) => (
                <View key={message.id} style={[styles.row, message.from === 'me' && styles.rowMe]}>
                  <View style={[styles.bubble, message.from === 'me' ? styles.bubbleMe : styles.bubbleBot]}>
                    <Text style={[styles.bubbleText, message.from === 'me' && styles.bubbleTextMe]}>{message.text}</Text>
                    {message.action ? (
                      <Pressable onPress={() => go(message.action!.route)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                        <Text style={styles.actionText}>{message.action.label}</Text>
                        <Ionicons name="arrow-forward" size={14} color={colors.accent} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent} keyboardShouldPersistTaps="handled">
              {SUGGESTIONS.map((s) => (
                <Pressable key={s.topic} onPress={() => ask(s.label, s.topic)} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                  <Text style={styles.chipText}>{s.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Ask a question…"
                placeholderTextColor={colors.muted}
                style={styles.input}
                returnKeyType="send"
                onSubmitEditing={() => ask(text)}
              />
              <Pressable onPress={() => ask(text)} disabled={!text.trim()} style={({ pressed }) => [styles.send, !text.trim() && styles.sendDisabled, pressed && styles.pressed]}>
                <Ionicons name="send" size={18} color={colors.bg} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  launcher: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 48,
    height: 48,
    opacity: 0.92,
    borderRadius: radii.round,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glow,
  },
  ring: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: radii.round,
    backgroundColor: colors.accent,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 12, 0.6)',
  },
  dismiss: {
    flex: 1,
  },
  sheet: {
    height: '78%',
    backgroundColor: colors.panel,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  close: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chat: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
  },
  rowMe: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '86%',
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  bubbleBot: {
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.line,
    borderTopLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: colors.accent,
    borderTopRightRadius: 4,
  },
  bubbleText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  bubbleTextMe: {
    color: colors.bg,
    fontWeight: '600',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.accent + '66',
    backgroundColor: colors.accentSoft,
  },
  actionText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  chips: {
    flexGrow: 0,
    maxHeight: 48,
  },
  chipsContent: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardLight,
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    color: colors.text,
    fontSize: 14,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.75,
  },
})
