import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors } from '@/constants/theme'

/** `doneNote` lights a step that clearly happened but has no recorded time. */
export type TimelineEvent = { label: string; at: string | null | undefined; doneNote?: string }

function stamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** Every step of a request with the time it happened; steps still to come show a dash. */
export function RequestTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>TIMELINE</Text>
      {events.map((event, index) => {
        const done = !!event.at || !!event.doneNote
        return (
          <View key={event.label} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, done && styles.dotOn]}>
                {done ? <Ionicons name="checkmark" size={11} color={colors.bg} /> : null}
              </View>
              {index < events.length - 1 ? <View style={[styles.line, done && styles.lineOn]} /> : null}
            </View>
            <View style={styles.text}>
              <Text style={[styles.label, done && styles.labelOn]}>{event.label}</Text>
              <Text style={styles.time}>{event.at ? stamp(event.at) : event.doneNote ?? 'Waiting'}</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  title: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },
  row: { flexDirection: 'row', minHeight: 40 },
  rail: { width: 22, alignItems: 'center' },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: colors.accent },
  line: { flex: 1, width: 2, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 2 },
  lineOn: { backgroundColor: colors.accent },
  text: { flex: 1, marginLeft: 10, paddingBottom: 8 },
  label: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  labelOn: { color: colors.text },
  time: { color: colors.muted, fontSize: 12, marginTop: 2 },
})
