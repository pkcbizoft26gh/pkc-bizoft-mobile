import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii } from '@/constants/theme'

// Self-service help for customers: a guided "fix it yourself" checklist for
// the most common problem (no / slow internet) and a short FAQ. It works
// offline. When the checklist doesn't help, the customer goes straight on to
// report the issue, so staff only get tickets that really need a technician.

type Step = { title: string; detail: string }

const FIX_STEPS: Step[] = [
  {
    title: 'Look at the lights on your modem',
    detail:
      'Power and Internet/PON should be steady (green or white). A red light, or one marked LOS, usually means the fiber line is cut or loose, so skip the next steps and report it.',
  },
  {
    title: 'Restart the modem',
    detail: 'Unplug it from power for 30 seconds, plug it back in, then wait about 3 minutes for all the lights to settle.',
  },
  {
    title: 'Check the cables',
    detail: 'Make sure the power adapter and the fiber/LAN cables are pushed in firmly and are not bent, pinched or chewed.',
  },
  {
    title: 'Reconnect your phone to Wi-Fi',
    detail: 'In Wi-Fi settings choose "Forget" for your network, then connect again with your password.',
  },
  {
    title: 'Try another device',
    detail: 'If another phone or laptop works, the problem is with your first device and not with the line.',
  },
  {
    title: 'Check your bills',
    detail: 'An overdue bill can pause the service. Open Plan & Bills to see if anything is unpaid.',
  },
]

type Faq = { q: string; a: string }

const FAQS: Faq[] = [
  {
    q: 'How do I pay my bill?',
    a: 'Open Plan & Bills, tap Pay with GCash, scan the QR and pay the exact amount. Then enter the reference number, upload the receipt and send it. Accounting checks it by hand.',
  },
  {
    q: 'How long until my payment is verified?',
    a: 'Accounting checks payments during working hours, usually within the same day. It shows as Waiting until then. Pull down on the Plan & Bills screen to refresh.',
  },
  {
    q: 'How do I change my plan?',
    a: 'In Plan & Bills choose the new plan, pay, and submit the application. Your current plan stays active until your billing period ends.',
  },
  {
    q: 'Why is my internet slow?',
    a: 'Try the speed test on Home, restart the modem, and move closer to it. Many devices streaming at once also slow things down. If the speed stays far below your plan, report an issue.',
  },
  {
    q: 'What does a red LOS light mean?',
    a: 'LOS means Loss of Signal: the modem is not receiving light from the fiber line. Do not bend or pull the cable; report the issue so a technician can check the line.',
  },
  {
    q: 'How do referral rewards work?',
    a: 'Share your referral code. When the friend you referred is installed, you earn a reward that you can request as a payout in the Referrals tab.',
  },
  {
    q: 'I forgot my password',
    a: 'On the login screen tap Forgot password and follow the code sent to your email. Password resets are limited to 3 per month.',
  },
]

type Props = {
  visible: boolean
  onClose: () => void
  /** Called when the checklist did not fix the problem. */
  onReport: () => void
}

export function HelpCenter({ visible, onClose, onReport }: Props) {
  const [tab, setTab] = useState<'fix' | 'faq'>('fix')
  const [done, setDone] = useState<Record<number, boolean>>({})
  const [open, setOpen] = useState<number | null>(null)
  const [fixed, setFixed] = useState(false)

  const doneCount = FIX_STEPS.filter((_, index) => done[index]).length

  function close() {
    onClose()
    // Start fresh next time.
    setDone({})
    setOpen(null)
    setFixed(false)
    setTab('fix')
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="help-buoy" size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Help center</Text>
              <Text style={styles.subtitle}>Fix common problems yourself, fast</Text>
            </View>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close help center" style={styles.close}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.tabs}>
            {(['fix', 'faq'] as const).map((key) => (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === key }}
                style={[styles.tab, tab === key && styles.tabOn]}
              >
                <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>
                  {key === 'fix' ? 'No internet? Quick fixes' : 'Questions'}
                </Text>
              </Pressable>
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {tab === 'fix' ? (
              fixed ? (
                <View style={styles.fixedBox}>
                  <Ionicons name="checkmark-circle" size={44} color={colors.success} />
                  <Text style={styles.fixedTitle}>Glad it works!</Text>
                  <Text style={styles.fixedText}>No ticket needed. If it happens again, come back here first.</Text>
                  <Pressable onPress={close} style={styles.primary} accessibilityRole="button">
                    <Text style={styles.primaryText}>Done</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  <Text style={styles.hint}>
                    Try these in order and tick each one. {doneCount} of {FIX_STEPS.length} done.
                  </Text>

                  {FIX_STEPS.map((step, index) => {
                    const checked = !!done[index]
                    return (
                      <Pressable
                        key={step.title}
                        onPress={() => setDone((prev) => ({ ...prev, [index]: !prev[index] }))}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked }}
                        style={[styles.step, checked && styles.stepDone]}
                      >
                        <View style={[styles.box, checked && styles.boxOn]}>
                          {checked ? <Ionicons name="checkmark" size={16} color={colors.bg} /> : <Text style={styles.boxNum}>{index + 1}</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.stepTitle, checked && styles.stepTitleDone]}>{step.title}</Text>
                          <Text style={styles.stepDetail}>{step.detail}</Text>
                        </View>
                      </Pressable>
                    )
                  })}

                  <Pressable onPress={() => setFixed(true)} style={styles.primary} accessibilityRole="button">
                    <Ionicons name="checkmark-circle-outline" size={18} color={colors.bg} />
                    <Text style={styles.primaryText}>It works now</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      close()
                      onReport()
                    }}
                    style={styles.secondary}
                    accessibilityRole="button"
                  >
                    <Ionicons name="construct-outline" size={18} color={colors.accent} />
                    <Text style={styles.secondaryText}>Still not working, report an issue</Text>
                  </Pressable>
                </>
              )
            ) : (
              FAQS.map((item, index) => {
                const expanded = open === index
                return (
                  <Pressable
                    key={item.q}
                    onPress={() => setOpen(expanded ? null : index)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    style={styles.faq}
                  >
                    <View style={styles.faqHead}>
                      <Text style={styles.faqQ}>{item.q}</Text>
                      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                    </View>
                    {expanded ? <Text style={styles.faqA}>{item.a}</Text> : null}
                  </Pressable>
                )
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: colors.panel,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 18,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18 },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.white, fontSize: 18, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  close: {
    width: 38,
    height: 38,
    borderRadius: radii.round,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 18,
    marginTop: 16,
    padding: 4,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radii.sm, alignItems: 'center' },
  tabOn: { backgroundColor: colors.accentSoft },
  tabText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  tabTextOn: { color: colors.accent },
  body: { padding: 18, paddingBottom: 34, gap: 12 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  step: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stepDone: { borderColor: colors.success },
  box: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.success },
  boxNum: { color: colors.accent, fontSize: 13, fontWeight: '900' },
  stepTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  stepTitleDone: { color: colors.success },
  stepDetail: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  primary: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    paddingVertical: 15,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.bg, fontSize: 15, fontWeight: '900' },
  secondary: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 15,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  fixedBox: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  fixedTitle: { color: colors.white, fontSize: 20, fontWeight: '800' },
  fixedText: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  faq: {
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  faqHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  faqQ: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '800' },
  faqA: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 10 },
})
