import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii } from '@/constants/theme'
import { supabase } from '@/lib/supabase'
import { isBiometricLockEnabled, unlockWithBiometrics } from '@/lib/biometric'
import { RobotMark } from '@/components/RobotMark'

// Full-screen lock shown on top of the whole app when the customer turned on
// "Unlock with fingerprint / face" in Profile. It locks when the app opens and
// again after the app has been in the background for a minute.

const RELOCK_AFTER_MS = 60_000

export function BiometricGate() {
  const [locked, setLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const backgroundedAt = useRef<number | null>(null)
  const prompting = useRef(false)

  const shouldLock = useCallback(async () => {
    if (!(await isBiometricLockEnabled())) return false
    const { data } = await supabase.auth.getSession()
    return !!data.session
  }, [])

  const prompt = useCallback(async () => {
    if (prompting.current) return
    prompting.current = true
    setBusy(true)
    const ok = await unlockWithBiometrics()
    prompting.current = false
    setBusy(false)
    if (ok) setLocked(false)
  }, [])

  // Lock on launch.
  useEffect(() => {
    let cancelled = false
    shouldLock().then((lock) => {
      if (cancelled || !lock) return
      setLocked(true)
      void prompt()
    })
    return () => {
      cancelled = true
    }
  }, [shouldLock, prompt])

  // Lock again after a minute in the background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt.current = Date.now()
        return
      }
      if (state !== 'active' || backgroundedAt.current === null) return

      const away = Date.now() - backgroundedAt.current
      backgroundedAt.current = null
      if (away < RELOCK_AFTER_MS) return

      shouldLock().then((lock) => {
        if (!lock) return
        setLocked(true)
        void prompt()
      })
    })
    return () => subscription.remove()
  }, [shouldLock, prompt])

  async function signOut() {
    await supabase.auth.signOut()
    setLocked(false)
  }

  if (!locked) return null

  return (
    <View style={styles.cover}>
      <RobotMark />
      <Text style={styles.title}>PKC BIZOFT is locked</Text>
      <Text style={styles.subtitle}>Use your fingerprint or face to continue.</Text>

      <Pressable onPress={prompt} disabled={busy} style={({ pressed }) => [styles.button, (pressed || busy) && styles.pressed]}>
        <Ionicons name="finger-print" size={22} color={colors.bg} />
        <Text style={styles.buttonText}>{busy ? 'Waiting…' : 'Unlock'}</Text>
      </Pressable>

      <Pressable onPress={signOut} style={styles.link}>
        <Text style={styles.linkText}>Can&apos;t unlock? Sign out</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    marginTop: 22,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 30,
    paddingHorizontal: 30,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  buttonText: {
    color: colors.bg,
    fontSize: 16,
    fontWeight: '800',
  },
  link: {
    marginTop: 22,
    padding: 8,
  },
  linkText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
})
