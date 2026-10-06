import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii, shadows } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import {
  measureDownload,
  measurePing,
  measureUpload,
  planSpeedMbps,
  SpeedPhase,
  SpeedResult,
} from '@/lib/speedtest'

const PHASE_LABEL: Record<SpeedPhase, string> = {
  idle: 'Ready to test',
  ping: 'Checking response time…',
  download: 'Testing download speed…',
  upload: 'Testing upload speed…',
  done: 'Test complete',
  error: 'Test failed',
}

function format(value: number | null, digits = 0) {
  return value === null ? '—' : value.toFixed(digits)
}

function verdict(download: number | null, plan: number | null) {
  if (download === null) return null
  if (!plan) return { color: colors.accent, text: 'Your plan speed could not be read, so there is nothing to compare against.' }
  const ratio = download / plan
  if (ratio >= 0.7) return { color: colors.success, text: `Great. You are getting about ${Math.round(ratio * 100)}% of your ${plan} Mbps plan.` }
  if (ratio >= 0.35) return { color: colors.medium, text: `Lower than your ${plan} Mbps plan (${Math.round(ratio * 100)}%). Try again closer to the router, with other devices paused.` }
  return { color: colors.danger, text: `Well below your ${plan} Mbps plan (${Math.round(ratio * 100)}%). If a wired or close-range test is also slow, report it in Requests & Help.` }
}

export function SpeedTestModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<SpeedPhase>('idle')
  const [result, setResult] = useState<SpeedResult>({ pingMs: null, downloadMbps: null, uploadMbps: null })
  const [plan, setPlan] = useState<number | null>(null)
  const [error, setError] = useState('')
  const running = phase === 'ping' || phase === 'download' || phase === 'upload'

  const spin = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!running) return
    spin.setValue(0)
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [running, spin])

  useEffect(() => {
    if (!visible) return
    setPhase('idle')
    setResult({ pingMs: null, downloadMbps: null, uploadMbps: null })
    setError('')

    let cancelled = false
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return
      const { data } = await supabase.from('clients').select('plan_name').eq('user_id', auth.user.id).maybeSingle()
      if (!cancelled) setPlan(planSpeedMbps(data?.plan_name))
    })()
    return () => {
      cancelled = true
    }
  }, [visible])

  async function start() {
    if (running) return
    setError('')
    setResult({ pingMs: null, downloadMbps: null, uploadMbps: null })

    try {
      setPhase('ping')
      const pingMs = await measurePing()
      setResult((r) => ({ ...r, pingMs }))

      setPhase('download')
      const downloadMbps = await measureDownload()
      setResult((r) => ({ ...r, downloadMbps }))

      setPhase('upload')
      const uploadMbps = await measureUpload()
      setResult((r) => ({ ...r, uploadMbps }))

      setPhase('done')
    } catch {
      setError('Could not reach the test server. Check your connection and try again.')
      setPhase('error')
    }
  }

  const summary = phase === 'done' ? verdict(result.downloadMbps, plan) : null

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.icon}>
              <Ionicons name="speedometer" size={22} color={colors.accent} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Speed test</Text>
              <Text style={styles.subtitle}>{plan ? `Your plan: ${plan} Mbps` : 'Check your connection'}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close speed test">
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          <View style={styles.gauge}>
            {running ? (
              <Animated.View
                style={[styles.gaugeRing, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}
              />
            ) : (
              <View style={[styles.gaugeRing, styles.gaugeRingStatic]} />
            )}
            <Text style={styles.gaugeValue}>{format(result.downloadMbps)}</Text>
            <Text style={styles.gaugeUnit}>Mbps download</Text>
          </View>

          <Text style={styles.phase}>{PHASE_LABEL[phase]}</Text>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>PING</Text>
              <Text style={styles.statValue}>{format(result.pingMs)}<Text style={styles.statUnit}> ms</Text></Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>DOWNLOAD</Text>
              <Text style={styles.statValue}>{format(result.downloadMbps)}<Text style={styles.statUnit}> Mbps</Text></Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>UPLOAD</Text>
              <Text style={styles.statValue}>{format(result.uploadMbps)}<Text style={styles.statUnit}> Mbps</Text></Text>
            </View>
          </View>

          {summary ? <Text style={[styles.verdict, { color: summary.color }]}>{summary.text}</Text> : null}
          {error ? <Text style={[styles.verdict, { color: colors.danger }]}>{error}</Text> : null}

          <Pressable onPress={start} disabled={running} style={({ pressed }) => [styles.button, (pressed || running) && styles.pressed]}>
            {running ? <ActivityIndicator size="small" color={colors.bg} /> : <Ionicons name="play" size={18} color={colors.bg} />}
            <Text style={styles.buttonText}>{running ? 'Testing…' : phase === 'done' || phase === 'error' ? 'Test again' : 'Start test'}</Text>
          </Pressable>

          <Text style={styles.note}>
            This is an estimate. Wi-Fi distance, other devices and your phone all affect it. For the best reading, stand near the router.
          </Text>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 12, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    ...shadows.card,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  icon: {
    width: 42,
    height: 42,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, marginLeft: 12 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  gauge: { alignSelf: 'center', width: 170, height: 170, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  gaugeRing: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 4,
    borderColor: colors.accent + '22',
    borderTopColor: colors.accent,
  },
  gaugeRingStatic: { borderTopColor: colors.accent + '88' },
  gaugeValue: { color: colors.text, fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  gaugeUnit: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  phase: { color: colors.accent, fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 16 },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 4 },
  statUnit: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  verdict: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 14, fontWeight: '600' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    marginTop: 18,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  buttonText: { color: colors.bg, fontSize: 15, fontWeight: '800' },
  note: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 12 },
  pressed: { opacity: 0.75 },
})
