import { useEffect, useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii } from '@/constants/theme'
import { GlassCard } from '@/components/GlassCard'
import { Alert } from '@/components/AppAlert'
import {
  biometricAvailable,
  isBiometricLockEnabled,
  setBiometricLockEnabled,
  unlockWithBiometrics,
} from '@/lib/biometric'

/** Profile setting: require fingerprint / face to open the app. Hidden if the phone can't do it. */
export function BiometricToggle() {
  const [available, setAvailable] = useState(false)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [ok, on] = await Promise.all([biometricAvailable(), isBiometricLockEnabled()])
      if (cancelled) return
      setAvailable(ok)
      setEnabled(on)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function change(next: boolean) {
    // Prove it works before turning it on, so nobody gets locked out by mistake.
    const ok = await unlockWithBiometrics(next ? 'Confirm to turn on the app lock' : 'Confirm to turn off the app lock')
    if (!ok) {
      Alert.alert('Not changed', 'The fingerprint or face check did not go through, so the app lock was left as it was.')
      return
    }
    await setBiometricLockEnabled(next)
    setEnabled(next)
  }

  if (!available) return null

  return (
    <GlassCard style={styles.card}>
      <View style={styles.icon}>
        <Ionicons name="finger-print" size={22} color={colors.accent} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>App lock</Text>
        <Text style={styles.subtitle}>Use your fingerprint or face to open PKC BIZOFT</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={change}
        trackColor={{ false: colors.line, true: colors.accent + '88' }}
        thumbColor={enabled ? colors.accent : colors.muted}
      />
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 16,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, marginLeft: 12, marginRight: 10 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
})
