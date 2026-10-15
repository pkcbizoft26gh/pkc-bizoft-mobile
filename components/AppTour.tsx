import { useCallback, useEffect, useState } from 'react'
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'

import { API_BASE_URL } from '@/lib/api'
import { colors, radii } from '@/constants/theme'

// A short first-run tour of the app, different for customers and technicians.
// It opens once after sign-in and can be opened again from Profile.

type Step = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }

const CUSTOMER_STEPS: Step[] = [
  { icon: 'home-outline', title: 'Home', body: 'Your request progress, bills due and notices are here. The bell shows new messages from us.' },
  { icon: 'wifi-outline', title: 'Apply for a plan', body: 'Pick a speed, pay the plan and installation fee together, then send your GCash or bank proof. Accounting checks it.' },
  { icon: 'receipt-outline', title: 'Plan & Bills', body: 'See every bill with its dates: pay by month-end, grace until the 4th, disconnection on the 5th. Tap Pay to send a payment.' },
  { icon: 'construct-outline', title: 'Requests', body: 'Something wrong? Report it here with a photo. Track the technician and chat about the job.' },
  { icon: 'people-outline', title: 'Referrals', body: 'Share your code. You earn when a friend is installed and has paid.' },
  { icon: 'person-outline', title: 'Profile', body: 'Your details, password, reminders and sign out. You can replay this tour here any time.' },
]

const TECHNICIAN_STEPS: Step[] = [
  { icon: 'speedometer-outline', title: 'Dashboard', body: 'Your open jobs, performance and stock at a glance.' },
  { icon: 'briefcase-outline', title: 'Jobs', body: 'Nearest jobs come first. Accept a job (up to 3 at once), then work solo or ask to team up.' },
  { icon: 'location-outline', title: 'I have arrived', body: 'Tap it when you reach the house. It starts the job and lets the customer know.' },
  { icon: 'checkbox-outline', title: 'Finish the job', body: 'Complete the checklist, scan the modem serial, take photos and get the signature, then mark completed.' },
  { icon: 'cube-outline', title: 'Materials', body: 'Take items from the store and use them on a job. Your truck stock shows what you carry.' },
  { icon: 'person-outline', title: 'Profile', body: 'Your details, rating and password. Live location is shared only while the Jobs screen is open.' },
]

const listeners = new Set<() => void>()

/** Opens the tour again (used by the Profile button). */
export function showAppTourAgain() {
  listeners.forEach((fn) => fn())
}

const keyFor = (userId: string) => `app-tour-seen-v1-${userId}`

export function AppTour({ userId, role }: { userId: string | null; role: 'customer' | 'technician' | null }) {
  const [visible, setVisible] = useState(false)
  const [index, setIndex] = useState(0)
  const steps = role === 'technician' ? TECHNICIAN_STEPS : CUSTOMER_STEPS

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
      setVisible(true)
    }
    listeners.add(open)
    return () => {
      listeners.delete(open)
    }
  }, [])

  const close = useCallback(() => {
    setVisible(false)
    if (userId) AsyncStorage.setItem(keyFor(userId), '1').catch(() => {})
  }, [userId])

  const step = steps[Math.min(index, steps.length - 1)]
  const last = index >= steps.length - 1

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.count}>
            {index + 1} of {steps.length}
          </Text>
          <View style={styles.iconWrap}>
            <Ionicons name={step.icon} size={34} color={colors.accent} />
          </View>
          <Text style={styles.title}>{step.title}</Text>
          <ScrollView style={{ maxHeight: 140 }}>
            <Text style={styles.body}>{step.body}</Text>
          </ScrollView>

          <View style={styles.dots}>
            {steps.map((s, i) => (
              <View key={s.title} style={[styles.dot, i === index && styles.dotOn]} />
            ))}
          </View>

          <View style={styles.row}>
            <Pressable onPress={close} style={styles.skip} accessibilityRole="button">
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {index > 0 ? (
                <Pressable onPress={() => setIndex(index - 1)} style={styles.back} accessibilityRole="button">
                  <Text style={styles.backText}>Back</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => (last ? close() : setIndex(index + 1))} style={styles.next} accessibilityRole="button">
                <Text style={styles.nextText}>{last ? 'Got it' : 'Next'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const LEGAL = [
  { label: 'Terms', path: '/terms' },
  { label: 'Privacy', path: '/privacy' },
  { label: 'Cookies', path: '/cookies' },
  { label: 'Guide', path: '/guide' },
]

/** App tour button plus links to the legal pages, for the Profile screens. */
export function LegalLinks() {
  return (
    <View style={styles.legal}>
      <Pressable onPress={showAppTourAgain} style={styles.tourBtn} accessibilityRole="button">
        <Ionicons name="compass-outline" size={18} color={colors.accent} />
        <Text style={styles.tourText}>App tour</Text>
      </Pressable>
      <View style={styles.legalRow}>
        {LEGAL.map((item) => (
          <Pressable key={item.path} onPress={() => Linking.openURL(`${API_BASE_URL}${item.path}`).catch(() => {})} hitSlop={8}>
            <Text style={styles.legalLink}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(2,6,12,0.85)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: colors.panel, borderRadius: radii.lg ?? 18, borderWidth: 1, borderColor: colors.border, padding: 22 },
  count: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
  iconWrap: { alignSelf: 'center', marginVertical: 14, width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,229,255,0.1)' },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent, width: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skip: { paddingVertical: 12, paddingHorizontal: 6 },
  skipText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  back: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  backText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  next: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 12, backgroundColor: colors.accent },
  nextText: { color: '#04101A', fontSize: 14, fontWeight: '800' },
  legal: { marginTop: 18, alignItems: 'center', gap: 12 },
  tourBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  tourText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  legalRow: { flexDirection: 'row', gap: 18 },
  legalLink: { color: colors.accent, fontSize: 13, fontWeight: '700' },
})
