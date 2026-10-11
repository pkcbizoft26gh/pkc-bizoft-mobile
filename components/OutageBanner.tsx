import { useCallback, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'

import { colors, radii } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

// Shows the customer any known outage in their area, so they do not report the
// same fault again. Staff post these from the web (Insights > Outages); the
// database decides which customers match.

type Outage = {
  id: string
  title: string
  message: string
  starts_at: string
  ends_at: string | null
}

function until(iso: string | null) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now()) return null
  return `Expected back around ${date.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
}

export function OutageBanner() {
  const [outages, setOutages] = useState<Outage[]>([])

  // Re-check whenever the Home tab comes into view.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        try {
          const { data, error } = await supabase.rpc('active_outages_for_me')
          if (!cancelled && !error && Array.isArray(data)) setOutages(data as Outage[])
        } catch {
          // A missing banner is better than a broken Home screen.
        }
      })()
      return () => {
        cancelled = true
      }
    }, []),
  )

  if (outages.length === 0) return null

  return (
    <View accessibilityRole="alert">
      {outages.map((outage) => (
        <View key={outage.id} style={styles.card}>
          <View style={styles.icon}>
            <Ionicons name="cloud-offline-outline" size={22} color={colors.medium} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{outage.title}</Text>
            <Text style={styles.message}>{outage.message}</Text>
            {until(outage.ends_at) ? <Text style={styles.until}>{until(outage.ends_at)}</Text> : null}
            <Text style={styles.hint}>No need to report this one. We are already working on it.</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    marginBottom: 14,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255, 200, 87, 0.08)',
    borderWidth: 1,
    borderColor: colors.medium,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255, 200, 87, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  message: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 4 },
  until: { color: colors.medium, fontSize: 12, fontWeight: '800', marginTop: 6 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 6 },
})
