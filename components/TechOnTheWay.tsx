import { useCallback, useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router'

import { colors, radii } from '@/constants/theme'
import { supabase } from '../lib/supabase'
import { distanceKm } from '../lib/location'

// "Your technician is on the way" card for the customer's Home screen. Shows
// only while their technician has started the job and not arrived yet; the
// database hides positions older than 10 minutes.

type TechLocation = {
  technician: string
  lat: number
  lng: number
  dest_lat: number | null
  dest_lng: number | null
  updated_at: string
}

const REFRESH_MS = 20000
const CITY_SPEED_KMH = 25

export function TechOnTheWay() {
  const [tech, setTech] = useState<TechLocation | null>(null)
  const [focused, setFocused] = useState(false)

  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => setFocused(false)
    }, []),
  )

  useEffect(() => {
    if (!focused) return
    let cancelled = false
    const load = async () => {
      const { data, error } = await supabase.rpc('my_technician_location')
      if (!cancelled && !error) setTech((data as TechLocation | null) ?? null)
    }
    void load()
    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [focused])

  if (!tech) return null

  const hasDest = tech.dest_lat != null && tech.dest_lng != null
  const km = hasDest
    ? distanceKm({ latitude: tech.lat, longitude: tech.lng }, { latitude: tech.dest_lat!, longitude: tech.dest_lng! })
    : null
  const minutes = km != null ? Math.max(1, Math.round((km / CITY_SPEED_KMH) * 60)) : null
  const ago = Math.max(0, Math.round((Date.now() - new Date(tech.updated_at).getTime()) / 60000))

  const openMap = () => {
    const url = hasDest
      ? `https://www.google.com/maps/dir/?api=1&origin=${tech.lat},${tech.lng}&destination=${tech.dest_lat},${tech.dest_lng}`
      : `https://www.google.com/maps/search/?api=1&query=${tech.lat},${tech.lng}`
    void Linking.openURL(url)
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons name="car-sport" size={24} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{tech.technician} is on the way</Text>
          <Text style={styles.sub}>
            {km != null
              ? km < 0.2
                ? 'Almost there'
                : `About ${km < 10 ? km.toFixed(1) : Math.round(km)} km away · around ${minutes} min`
              : 'Heading to you now'}
          </Text>
          <Text style={styles.updated}>Updated {ago === 0 ? 'just now' : `${ago} min ago`}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={openMap}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}
      >
        <Ionicons name="map-outline" size={16} color={colors.bg} />
        <Text style={styles.buttonText}>See on the map</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    padding: 16,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.accentDark,
    backgroundColor: colors.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  sub: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  updated: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
  button: {
    marginTop: 12,
    minHeight: 42,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: colors.bg,
    fontSize: 14,
    fontWeight: '900',
  },
})
