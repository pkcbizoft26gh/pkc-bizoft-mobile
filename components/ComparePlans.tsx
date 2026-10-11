import { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii } from '@/constants/theme'
import { peso, type Plan } from '@/lib/billing'

// Side-by-side plan comparison with a two-question "which plan fits me?"
// picker. The suggestion is a simple rule of thumb (devices + what they do
// online), not a speed guarantee, and the copy says so.

const DEVICES = [
  { label: '1 to 3', hint: 'Just me or a couple of people', points: 0 },
  { label: '4 to 6', hint: 'A typical family', points: 1 },
  { label: '7 or more', hint: 'Big household or small business', points: 2 },
]

const USAGE = [
  { label: 'Browsing & chat', hint: 'Facebook, messaging, light video', points: 0 },
  { label: 'Streaming', hint: 'YouTube, Netflix, video calls', points: 1 },
  { label: 'Heavy use', hint: 'Online games, work from home, many streams at once', points: 2 },
]

type Props = {
  visible: boolean
  plans: Plan[]
  currentPlan: string | null | undefined
  onClose: () => void
  onChoose: (planName: string) => void
}

export function ComparePlans({ visible, plans, currentPlan, onClose, onChoose }: Props) {
  const [devices, setDevices] = useState<number | null>(null)
  const [usage, setUsage] = useState<number | null>(null)

  const sorted = useMemo(() => [...plans].sort((a, b) => a.price - b.price), [plans])
  const current = sorted.find((plan) => plan.name === currentPlan?.trim()) ?? null

  const suggested = useMemo(() => {
    if (devices == null || usage == null || sorted.length === 0) return null
    const score = DEVICES[devices].points + USAGE[usage].points // 0..4
    return sorted[Math.round((score / 4) * (sorted.length - 1))]
  }, [devices, usage, sorted])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="git-compare-outline" size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Compare plans</Text>
              <Text style={styles.subtitle}>Find the plan that fits your home</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close compare plans" style={styles.close}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.question}>How many devices use your Wi-Fi?</Text>
            <View style={styles.choices}>
              {DEVICES.map((item, index) => (
                <Choice key={item.label} {...item} selected={devices === index} onPress={() => setDevices(index)} />
              ))}
            </View>

            <Text style={styles.question}>What do you mostly do online?</Text>
            <View style={styles.choices}>
              {USAGE.map((item, index) => (
                <Choice key={item.label} {...item} selected={usage === index} onPress={() => setUsage(index)} />
              ))}
            </View>

            {suggested ? (
              <View style={styles.suggest}>
                <Ionicons name="sparkles" size={18} color={colors.accent} />
                <Text style={styles.suggestText}>
                  Suggested for you: <Text style={styles.suggestName}>{suggested.name}</Text>
                </Text>
              </View>
            ) : (
              <Text style={styles.hint}>Answer both questions to get a suggestion.</Text>
            )}

            {sorted.map((plan) => {
              const isCurrent = current?.name === plan.name
              const isSuggested = suggested?.name === plan.name
              const diff = current ? plan.price - current.price : null

              return (
                <View key={plan.name} style={[styles.card, isSuggested && styles.cardSuggested, isCurrent && styles.cardCurrent]}>
                  <View style={styles.cardTop}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    {isCurrent ? <Badge text="CURRENT" tone="muted" /> : null}
                    {isSuggested ? <Badge text="BEST FIT" tone="accent" /> : null}
                  </View>

                  <Text style={styles.price}>
                    {peso(plan.price)}
                    <Text style={styles.per}> / month</Text>
                  </Text>
                  <Text style={styles.perDay}>about {peso(plan.price / 30)} a day</Text>

                  {plan.speed ? (
                    <Row icon="speedometer-outline" text={`Up to ${plan.speed}`} />
                  ) : null}
                  <Row icon="information-circle-outline" text={plan.description} />
                  {diff != null && diff !== 0 ? (
                    <Row
                      icon={diff > 0 ? 'trending-up-outline' : 'trending-down-outline'}
                      text={`${diff > 0 ? 'Costs' : 'Saves'} ${peso(Math.abs(diff))} a month compared to your current plan`}
                    />
                  ) : null}

                  {!isCurrent ? (
                    <Pressable
                      onPress={() => {
                        onChoose(plan.name)
                        onClose()
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Choose ${plan.name}`}
                      style={({ pressed }) => [styles.choose, pressed && { opacity: 0.8 }]}
                    >
                      <Text style={styles.chooseText}>Choose this plan</Text>
                    </Pressable>
                  ) : null}
                </View>
              )
            })}

            <Text style={styles.note}>
              This is a guide only. Real speeds depend on your Wi-Fi, your devices and how many people are online at once.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

function Choice({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string
  hint: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.choice, selected && styles.choiceOn]}
    >
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.accent : colors.muted} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.choiceLabel, selected && { color: colors.accent }]}>{label}</Text>
        <Text style={styles.choiceHint}>{hint}</Text>
      </View>
    </Pressable>
  )
}

function Badge({ text, tone }: { text: string; tone: 'accent' | 'muted' }) {
  return (
    <View style={[styles.badge, tone === 'accent' ? styles.badgeAccent : styles.badgeMuted]}>
      <Text style={[styles.badgeText, tone === 'accent' && { color: colors.bg }]}>{text}</Text>
    </View>
  )
}

function Row({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={16} color={colors.accent} style={{ marginTop: 2 }} />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
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
  body: { padding: 18, paddingBottom: 36, gap: 12 },
  question: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
  choices: { gap: 8 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  choiceOn: { borderColor: colors.accent, backgroundColor: colors.cardLight },
  choiceLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  choiceHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  suggest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentDark,
  },
  suggestText: { color: colors.text, fontSize: 14, flex: 1 },
  suggestName: { color: colors.accent, fontWeight: '900' },
  hint: { color: colors.muted, fontSize: 13 },
  card: {
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 6,
  },
  cardSuggested: { borderColor: colors.accent },
  cardCurrent: { borderColor: colors.border },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { color: colors.white, fontSize: 17, fontWeight: '900' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.round },
  badgeAccent: { backgroundColor: colors.accent },
  badgeMuted: { backgroundColor: colors.overlay, borderWidth: 1, borderColor: colors.border },
  badgeText: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  price: { color: colors.accent, fontSize: 24, fontWeight: '900', marginTop: 4 },
  per: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  perDay: { color: colors.muted, fontSize: 12, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8 },
  rowText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  choose: {
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    alignItems: 'center',
  },
  chooseText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
})
