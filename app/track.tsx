import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { supabase } from '@/lib/supabase'
import { distanceKm, formatDistance } from '@/lib/location'
import { colors, radii } from '@/constants/theme'

type Job = {
  id: string
  job_type: string | null
  problem_description: string | null
  status: string | null
  technician: string | null
  technician_phone: string | null
  technician_user_id: string | null
  latitude: number | null
  longitude: number | null
}

type TechSpot = { latitude: number; longitude: number; updated_at: string }

const DONE = /(complete|resolved|done|fixed|closed|cancel)/i
const REFRESH_MS = 20000

function minutesAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 minute ago'
  return `${mins} minutes ago`
}

export default function TrackTechnicianScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [loading, setLoading] = useState(true)
  const [job, setJob] = useState<Job | null>(null)
  const [spot, setSpot] = useState<TechSpot | null>(null)
  const [fallback, setFallback] = useState<{ latitude: number | null; longitude: number | null }>({
    latitude: null,
    longitude: null,
  })
  const [error, setError] = useState('')
  const alive = useRef(true)

  const load = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: client } = await supabase
        .from('clients')
        .select('id, latitude, longitude')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!client) {
        if (alive.current) setJob(null)
        return
      }

      const { data: jobs, error: jobError } = await supabase
        .from('repair_records')
        .select(
          'id, job_type, problem_description, status, technician, technician_phone, technician_user_id, latitude, longitude',
        )
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(10)

      if (jobError) throw jobError

      const open = ((jobs || []) as Job[]).find((row) => !DONE.test(row.status || '')) || null

      let location: TechSpot | null = null
      if (open?.technician_user_id) {
        const { data } = await supabase
          .from('technician_locations')
          .select('latitude, longitude, updated_at')
          .eq('user_id', open.technician_user_id)
          .maybeSingle()
        location = (data as TechSpot | null) ?? null
      }

      if (!alive.current) return
      setFallback({ latitude: client.latitude, longitude: client.longitude })
      setJob(open)
      setSpot(location)
      setError('')
    } catch (e: any) {
      if (alive.current) setError(e?.message || 'Unable to load the technician status.')
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [router])

  useEffect(() => {
    alive.current = true
    void load()
    const timer = setInterval(() => void load(), REFRESH_MS)
    return () => {
      alive.current = false
      clearInterval(timer)
    }
  }, [load])

  const destLat = job?.latitude ?? fallback.latitude
  const destLon = job?.longitude ?? fallback.longitude
  const fresh = spot ? Date.now() - new Date(spot.updated_at).getTime() < 10 * 60000 : false
  const away =
    fresh && spot && destLat !== null && destLon !== null
      ? formatDistance(
          distanceKm(
            { latitude: spot.latitude, longitude: spot.longitude },
            { latitude: destLat, longitude: destLon },
          ),
        )
      : ''

  const isInstall = job?.job_type === 'installation'
  const title = isInstall ? 'Installation visit' : 'Repair visit'
  const assigned = !!job?.technician_user_id

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>CUSTOMER ACCOUNT</Text>
            <Text style={styles.title}>Track Technician</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} size="large" color={colors.accent} />
        ) : error ? (
          <View style={styles.card}>
            <Ionicons name="alert-circle-outline" size={24} color={colors.danger} />
            <Text style={styles.body}>{error}</Text>
          </View>
        ) : !job ? (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="location-outline" size={28} color={colors.muted} />
            </View>
            <Text style={styles.cardTitle}>No visit scheduled</Text>
            <Text style={styles.body}>
              When you have an installation or a repair, you can follow your technician here
              once they accept the job. Applied for a plan? It appears after Accounting verifies
              your payment.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons name={isInstall ? 'wifi' : 'construct-outline'} size={26} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{title}</Text>
                <Text style={styles.body} numberOfLines={3}>
                  {job.problem_description || 'Service visit'}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.label}>STATUS</Text>
            <Text style={styles.value}>{job.status || 'Pending'}</Text>

            <Text style={[styles.label, { marginTop: 14 }]}>TECHNICIAN</Text>
            {assigned ? (
              <>
                <Text style={styles.value}>{job.technician || 'Assigned technician'}</Text>
                {away ? (
                  <Text style={styles.away}>
                    About {away} away
                    {spot ? ` · updated ${minutesAgo(spot.updated_at)}` : ''}
                  </Text>
                ) : (
                  <Text style={styles.body}>
                    Live location isn&apos;t available right now. It shows while the technician has
                    the app open.
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.body}>
                Waiting for a technician to accept your job. We&apos;ll notify you when someone is
                assigned.
              </Text>
            )}

            {assigned ? (
              <View style={styles.actions}>
                {job.technician_phone ? (
                  <Pressable
                    onPress={() => void Linking.openURL(`tel:${job.technician_phone}`)}
                    style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                  >
                    <Ionicons name="call" size={17} color={colors.bg} />
                    <Text style={styles.primaryText}>Call technician</Text>
                  </Pressable>
                ) : null}

                {spot && fresh ? (
                  <Pressable
                    onPress={() =>
                      void Linking.openURL(
                        `https://www.google.com/maps/search/?api=1&query=${spot.latitude},${spot.longitude}`,
                      )
                    }
                    style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
                  >
                    <Ionicons name="map-outline" size={17} color={colors.accent} />
                    <Text style={styles.secondaryText}>See on map</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        )}

        <Text style={styles.footnote}>This page refreshes automatically every 20 seconds.</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  close: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 6 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 14 },
  label: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  value: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
  away: { color: colors.accent, fontSize: 13, fontWeight: '700', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  primaryText: { color: colors.bg, fontSize: 14, fontWeight: '900' },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  secondaryText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  footnote: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 18 },
  pressed: { opacity: 0.75 },
})
