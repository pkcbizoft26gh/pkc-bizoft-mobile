import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'

// The technician's own numbers, from the my_technician_stats() database
// function: jobs finished this week and month, how fast they finish a job
// once accepted, and the average rating customers gave them.

export type TechnicianStats = {
  completed_7d: number
  completed_30d: number
  completed_total: number
  active: number
  avg_hours: number | null
  avg_stars: number | null
  rating_count: number
}

function duration(hours: number | null) {
  if (hours == null) return 'No data yet'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`
  if (hours < 48) return `${hours.toFixed(1).replace(/\.0$/, '')} hr`
  return `${Math.round(hours / 24)} days`
}

export function PerformanceCard({ stats }: { stats: TechnicianStats }) {
  const stars = stats.avg_stars == null ? null : Number(stats.avg_stars)

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name="trophy-outline" size={21} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>My performance</Text>
          <Text style={styles.sub}>{stats.completed_total} job{stats.completed_total === 1 ? '' : 's'} finished in total</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <Metric value={String(stats.completed_7d)} label="This week" />
        <Metric value={String(stats.completed_30d)} label="This month" />
        <Metric value={String(stats.active)} label="Open now" />
      </View>

      <View style={styles.rows}>
        <View style={styles.row}>
          <Ionicons name="time-outline" size={18} color={colors.accent} />
          <Text style={styles.rowLabel}>Average time to finish a job</Text>
          <Text style={styles.rowValue}>{duration(stats.avg_hours)}</Text>
        </View>

        <View style={styles.row}>
          <Ionicons name="star" size={18} color={colors.medium} />
          <Text style={styles.rowLabel}>Customer rating (90 days)</Text>
          {stars == null ? (
            <Text style={styles.rowValue}>No ratings yet</Text>
          ) : (
            <Text style={styles.rowValue}>
              {stars.toFixed(1)} / 5 <Text style={styles.count}>({stats.rating_count})</Text>
            </Text>
          )}
        </View>
      </View>

      {stars != null ? (
        <View style={styles.starRow} accessibilityLabel={`${stars.toFixed(1)} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Ionicons
              key={n}
              name={stars >= n - 0.25 ? 'star' : stars >= n - 0.75 ? 'star-half' : 'star-outline'}
              size={22}
              color={colors.medium}
            />
          ))}
        </View>
      ) : null}
    </GlassCard>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { padding: 16, marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  grid: { flexDirection: 'row', gap: 10, marginTop: 16 },
  metric: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  metricValue: { color: colors.white, fontSize: 24, fontWeight: '900' },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  rows: { marginTop: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { flex: 1, color: colors.muted, fontSize: 13 },
  rowValue: { color: colors.text, fontSize: 13, fontWeight: '800' },
  count: { color: colors.muted, fontWeight: '600' },
  starRow: { flexDirection: 'row', gap: 4, marginTop: 12 },
})
