import { StyleSheet, Text, View } from 'react-native'

import { colors, radii } from '@/constants/theme'
import type { SpeedEntry } from '@/lib/speedHistory'

// A small bar chart of past download speeds, oldest on the left, with a line at
// the speed of the customer's plan. Bars below half the plan turn red.

type Props = {
  entries: SpeedEntry[]
}

const HEIGHT = 96

export function SpeedChart({ entries }: Props) {
  const points = entries
    .filter((e) => e.downloadMbps !== null)
    .slice(0, 14)
    .reverse()

  if (points.length < 2) return null

  const plan = points.find((p) => p.planMbps)?.planMbps ?? null
  const peak = Math.max(1, plan ?? 0, ...points.map((p) => p.downloadMbps as number))
  const planY = plan ? (plan / peak) * HEIGHT : null

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`Chart of your last ${points.length} speed tests. Latest ${Math.round(points[points.length - 1].downloadMbps as number)} megabits per second.`}
    >
      <View style={[styles.plot, { height: HEIGHT }]}>
        {planY !== null ? <View style={[styles.planLine, { bottom: planY }]} /> : null}
        {points.map((p) => {
          const value = p.downloadMbps as number
          const slow = plan ? value < plan * 0.5 : false
          return (
            <View key={p.at} style={styles.col}>
              <View style={[styles.bar, { height: Math.max(3, (value / peak) * HEIGHT) }, slow && styles.barSlow]} />
            </View>
          )
        })}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisText}>{new Date(points[0].at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</Text>
        {plan ? <Text style={styles.axisText}>Plan: {plan} Mbps</Text> : null}
        <Text style={styles.axisText}>{new Date(points[points.length - 1].at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</Text>
      </View>
    </View>
  )
}

/** True when the last few tests are all well below the plan, so slow internet is likely real. */
export function isPersistentlySlow(entries: SpeedEntry[]) {
  const recent = entries.filter((e) => e.downloadMbps !== null && e.planMbps).slice(0, 3)
  return recent.length >= 3 && recent.every((e) => (e.downloadMbps as number) < (e.planMbps as number) * 0.5)
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10, marginBottom: 6 },
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    padding: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.line,
  },
  col: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderRadius: 3, backgroundColor: colors.accent },
  barSlow: { backgroundColor: colors.danger },
  planLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.success,
  },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { color: colors.muted, fontSize: 12 },
})
