import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'
import {
  DEFAULT_PREFS,
  loadReminderPrefs,
  loadReminders,
  saveReminderPrefs,
  syncReminderNotifications,
  type ReminderPrefs,
} from '@/lib/reminders'

// Lets the customer decide how early, and at what time, they are reminded
// about bills and the end of their plan period.

const HOURS = [7, 9, 12, 18, 20]

function hourLabel(hour: number) {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}:00 ${suffix}`
}

export function ReminderSettings() {
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_PREFS)
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void loadReminderPrefs().then((value) => {
      setPrefs(value)
      setLoaded(true)
    })
  }, [])

  async function update(next: ReminderPrefs) {
    setPrefs(next)
    setSaved(false)
    try {
      await saveReminderPrefs(next)
      // Rebuild the phone's scheduled notifications right away.
      await syncReminderNotifications(await loadReminders())
      setSaved(true)
    } catch {
      // Settings are a convenience; keep the screen usable if saving fails.
    }
  }

  if (!loaded) return null

  return (
    <GlassCard style={styles.card}>
      <View style={styles.top}>
        <View style={styles.icon}>
          <Ionicons name="alarm-outline" size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Payment reminders</Text>
          <Text style={styles.sub}>
            {prefs.enabled
              ? `We remind you ${prefs.days} day${prefs.days === 1 ? '' : 's'} before, at ${hourLabel(prefs.hour)}`
              : 'Reminders are off'}
          </Text>
        </View>
        <Switch
          value={prefs.enabled}
          onValueChange={(enabled) => void update({ ...prefs, enabled })}
          trackColor={{ false: colors.line, true: colors.accentDark }}
          thumbColor={prefs.enabled ? colors.accent : colors.muted}
          accessibilityLabel="Payment reminders"
        />
      </View>

      {prefs.enabled ? (
        <>
          <Text style={styles.label}>DAYS BEFORE THE DUE DATE</Text>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => void update({ ...prefs, days: Math.max(1, prefs.days - 1) })}
              disabled={prefs.days <= 1}
              accessibilityRole="button"
              accessibilityLabel="Remind one day later"
              style={[styles.stepButton, prefs.days <= 1 && styles.disabled]}
            >
              <Ionicons name="remove" size={20} color={colors.accent} />
            </Pressable>
            <Text style={styles.days}>{prefs.days}</Text>
            <Pressable
              onPress={() => void update({ ...prefs, days: Math.min(7, prefs.days + 1) })}
              disabled={prefs.days >= 7}
              accessibilityRole="button"
              accessibilityLabel="Remind one day earlier"
              style={[styles.stepButton, prefs.days >= 7 && styles.disabled]}
            >
              <Ionicons name="add" size={20} color={colors.accent} />
            </Pressable>
          </View>

          <Text style={styles.label}>TIME OF DAY</Text>
          <View style={styles.hours}>
            {HOURS.map((hour) => (
              <Pressable
                key={hour}
                onPress={() => void update({ ...prefs, hour })}
                accessibilityRole="button"
                accessibilityState={{ selected: prefs.hour === hour }}
                style={[styles.chip, prefs.hour === hour && styles.chipOn]}
              >
                <Text style={[styles.chipText, prefs.hour === hour && styles.chipTextOn]}>{hourLabel(hour)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {saved ? (
        <View style={styles.savedRow}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <Text style={styles.saved}>Saved</Text>
        </View>
      ) : null}
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  card: { padding: 16, marginBottom: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  label: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginTop: 18, marginBottom: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
  days: { color: colors.white, fontSize: 24, fontWeight: '900', minWidth: 36, textAlign: 'center' },
  hours: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.round,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: colors.accent },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  saved: { color: colors.success, fontSize: 12, fontWeight: '700' },
})
