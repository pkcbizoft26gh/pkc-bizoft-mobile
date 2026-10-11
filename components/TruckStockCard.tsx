import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'

import { colors, radii } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'
import { fetchTruckStock, type TruckItem } from '@/lib/truck'

// "My truck": what the technician is carrying, with a warning for low items.
// Stock is loaded onto the truck by inventory staff and used on jobs.

export function TruckStockCard() {
  const [items, setItems] = useState<TruckItem[] | null>(null)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void fetchTruckStock().then((list) => {
        if (!cancelled) setItems(list)
      })
      return () => {
        cancelled = true
      }
    }, []),
  )

  if (items === null) return null

  const low = items.filter((item) => item.low)

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name="car-outline" size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>My truck</Text>
          <Text style={styles.sub}>
            {items.length === 0
              ? 'Nothing loaded yet. Ask the inventory team to load your truck.'
              : low.length > 0
                ? `${low.length} item${low.length === 1 ? ' is' : 's are'} running low`
                : 'Everything is stocked'}
          </Text>
        </View>
      </View>

      {items.map((item) => (
        <View key={item.item_id} style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          {item.low ? (
            <View style={styles.lowBadge}>
              <Text style={styles.lowText}>LOW</Text>
            </View>
          ) : null}
          <Text style={[styles.qty, item.low && { color: colors.danger }]}>
            {item.quantity}
            {item.unit ? ` ${item.unit}` : ''}
          </Text>
        </View>
      ))}
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  card: { padding: 16, marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  name: { flex: 1, color: colors.text, fontSize: 14 },
  qty: { color: colors.white, fontSize: 14, fontWeight: '800' },
  lowBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.round, backgroundColor: 'rgba(255,92,122,0.15)' },
  lowText: { color: colors.danger, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
})
