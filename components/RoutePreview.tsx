import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii } from '@/constants/theme'

// Shows the technician the order of today's stops before handing off to
// Google Maps: who, where, and roughly how far each hop is. Distances are
// straight-line, so the real road distance will be a bit longer.

export type RouteStop = {
  id: string
  name: string
  place: string
  problem: string
  /** Straight-line km from the previous stop (or from the technician). */
  legKm: number | null
}

type Props = {
  visible: boolean
  stops: RouteStop[]
  /** True when the technician's own position is the starting point. */
  fromHere: boolean
  truncated: boolean
  onStart: () => void
  onClose: () => void
}

function km(value: number | null) {
  if (value == null) return ''
  return value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`
}

export function RoutePreview({ visible, stops, fromHere, truncated, onStart, onClose }: Props) {
  const total = stops.reduce((sum, stop) => sum + (stop.legKm ?? 0), 0)

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="navigate" size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Today's route</Text>
              <Text style={styles.subtitle}>
                {stops.length} stop{stops.length === 1 ? '' : 's'} · about {km(total)} in a straight line
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close route" style={styles.close}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.start}>
              <View style={[styles.dot, styles.dotStart]} />
              <Text style={styles.startText}>{fromHere ? 'You are here' : 'Starting point not known'}</Text>
            </View>

            {stops.map((stop, index) => (
              <View key={stop.id} style={styles.stopRow}>
                <View style={styles.rail}>
                  <View style={styles.line} />
                  <View style={styles.dot}>
                    <Text style={styles.dotText}>{index + 1}</Text>
                  </View>
                  {index < stops.length - 1 ? <View style={[styles.line, { flex: 1 }]} /> : null}
                </View>

                <View style={styles.stopCard}>
                  <View style={styles.stopTop}>
                    <Text style={styles.stopName} numberOfLines={1}>
                      {stop.name}
                    </Text>
                    {stop.legKm != null ? <Text style={styles.leg}>+{km(stop.legKm)}</Text> : null}
                  </View>
                  {stop.place ? <Text style={styles.stopPlace}>{stop.place}</Text> : null}
                  {stop.problem ? (
                    <Text style={styles.stopProblem} numberOfLines={2}>
                      {stop.problem}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}

            {truncated ? (
              <Text style={styles.note}>Google Maps takes up to 10 stops, so only the first 10 are sent. Do the rest in a second trip.</Text>
            ) : null}
            <Text style={styles.note}>Stops are ordered nearest-next. Road distance is usually longer than the straight line.</Text>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable onPress={onStart} accessibilityRole="button" style={({ pressed }) => [styles.go, pressed && { opacity: 0.8 }]}>
              <Ionicons name="map" size={18} color={colors.bg} />
              <Text style={styles.goText}>Start in Google Maps</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
  body: { padding: 18, paddingBottom: 12 },
  start: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  startText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  rail: { width: 26, alignItems: 'center' },
  line: { width: 2, height: 12, backgroundColor: colors.border },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotStart: { width: 14, height: 14, borderRadius: 7, marginLeft: 6, backgroundColor: colors.success },
  dotText: { color: colors.bg, fontSize: 12, fontWeight: '900' },
  stopRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  stopCard: {
    flex: 1,
    padding: 12,
    marginVertical: 6,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stopTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '800' },
  leg: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  stopPlace: { color: colors.muted, fontSize: 12, marginTop: 3 },
  stopProblem: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 10 },
  footer: { padding: 18, paddingTop: 8 },
  go: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 15,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goText: { color: colors.bg, fontSize: 15, fontWeight: '900' },
})
