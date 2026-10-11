import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { GlassCard } from '@/components/GlassCard'
import { colors } from '@/constants/theme'

const STEPS = ['Registered', 'For installation', 'Installed']

// Where the installation stands, from the status text on the account.
function stepOf(status: string | null | undefined) {
  const value = String(status || '').toLowerCase()
  if (/(installed|complete|done|active)/.test(value)) return 2
  if (/(for install|schedul|ongoing|progress|assigned|on the way)/.test(value)) return 1
  return 0
}

export function InstallProgress({ status }: { status: string | null | undefined }) {
  const step = stepOf(status)
  return (
    <GlassCard style={styles.card}>
      <Text style={styles.title}>INSTALLATION PROGRESS</Text>
      <View style={styles.row}>
        {STEPS.map((label, index) => {
          const done = index <= step
          return (
            <View key={label} style={styles.item}>
              <View style={styles.markerRow}>
                <View style={[styles.line, index === 0 && styles.lineHidden, done && styles.lineOn]} />
                <View style={[styles.dot, done && styles.dotOn]}>
                  <Ionicons
                    name={index < step || (index === step && step === 2) ? 'checkmark' : 'ellipse'}
                    size={index < step || (index === step && step === 2) ? 14 : 8}
                    color={done ? colors.bg : colors.muted}
                  />
                </View>
                <View
                  style={[
                    styles.line,
                    index === STEPS.length - 1 && styles.lineHidden,
                    index < step && styles.lineOn,
                  ]}
                />
              </View>
              <Text style={[styles.label, done && styles.labelOn]}>{label}</Text>
            </View>
          )
        })}
      </View>
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  card: { paddingVertical: 18, paddingHorizontal: 16, marginBottom: 16 },
  title: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 16 },
  row: { flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center' },
  markerRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  line: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  lineOn: { backgroundColor: colors.accent },
  lineHidden: { backgroundColor: 'transparent' },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: colors.accent },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  labelOn: { color: colors.accent },
})
