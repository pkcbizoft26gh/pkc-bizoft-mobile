import React, { useCallback, useEffect, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'

import { colors, radii } from '@/constants/theme'
import { Reminder, loadReminders, syncReminderNotifications } from '@/lib/reminders'

// Shows the bill / plan reminders inside the app and keeps the phone's
// scheduled notifications in step with them. Renders nothing when there is
// nothing to remind about.
export function ReminderBanner() {
  const router = useRouter()
  const [reminders, setReminders] = useState<Reminder[]>([])

  const refresh = useCallback(async () => {
    const next = await loadReminders()
    setReminders(next)
    await syncReminderNotifications(next)
  }, [])

  useEffect(() => {
    refresh()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => sub.remove()
  }, [refresh])

  if (reminders.length === 0) return null

  return (
    <View style={styles.wrap}>
      {reminders.map((reminder) => (
        <Pressable
          key={reminder.id}
          onPress={() => reminder.kind === 'bill' && router.push('/payment')}
          style={[styles.card, reminder.daysLeft <= 1 && styles.urgent]}
        >
          <Ionicons
            name={reminder.kind === 'bill' ? 'alarm-outline' : 'time-outline'}
            size={22}
            color={reminder.daysLeft <= 1 ? colors.danger : colors.warning}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{reminder.title}</Text>
            <Text style={styles.body}>{reminder.body}</Text>
          </View>
          {reminder.kind === 'bill' ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255,200,87,0.35)',
    backgroundColor: 'rgba(255,200,87,0.08)',
  },
  urgent: { borderColor: 'rgba(255,92,122,0.45)', backgroundColor: 'rgba(255,92,122,0.08)' },
  title: { color: colors.text, fontSize: 14, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
})
