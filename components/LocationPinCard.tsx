import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { Alert } from '@/components/AppAlert'
import { GlassCard } from '@/components/GlassCard'
import { supabase } from '@/lib/supabase'
import { savePinHere } from '@/lib/pinCapture'
import { colors, radii } from '@/constants/theme'

// Customer profile card: set the exact pin where the internet is (or will be)
// installed. Updates the saved pin and any open job so the technician goes to
// the right spot.
export function LocationPinCard() {
  const [hasPin, setHasPin] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth.user) return
    const { data } = await supabase
      .from('clients')
      .select('latitude, longitude')
      .eq('user_id', auth.user.id)
      .maybeSingle()
    setHasPin(data ? data.latitude != null && data.longitude != null : null)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function setPin() {
    setBusy(true)
    setNotice('')
    try {
      const result = await savePinHere()
      if (result.status === 'saved') {
        setNotice(`Pin saved (about ${Math.max(Math.round(result.accuracy), 1)} m accurate).`)
        await load()
      } else if (result.status === 'no-location') {
        Alert.alert('Location needed', 'We could not read your location. Turn on Location (GPS), allow PKC BIZOFT to use it, and try again.')
      } else if (result.status === 'weak') {
        Alert.alert(
          'Weak GPS signal',
          `Your location is only accurate to about ${Math.round(result.accuracy)} m. Step outside or next to a window and try again for an exact pin.`,
        )
      } else if (result.status === 'error') {
        Alert.alert('Unable to save', result.message)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassCard style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}>
          <Ionicons name="location-outline" size={21} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>My location pin</Text>
          <Text style={styles.text}>
            {hasPin === false
              ? 'No pin yet. Tap the button while you are at the place where the internet is installed so the technician finds you.'
              : 'Technicians use this pin to find you. If it is wrong, stand at your house and set it again.'}
          </Text>
        </View>
      </View>

      {!!notice && <Text style={styles.notice}>{notice}</Text>}

      <Pressable
        onPress={() => void setPin()}
        disabled={busy}
        style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.75 }]}
      >
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.buttonText}>{hasPin ? 'SET MY PIN AGAIN HERE' : 'SET MY PIN HERE'}</Text>
        )}
      </Pressable>
    </GlassCard>
  )
}

const styles = StyleSheet.create({
  card: { padding: 16, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 14, fontWeight: '800' },
  text: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  notice: { color: colors.success, fontSize: 12, marginTop: 10 },
  button: {
    height: 42,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  buttonText: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
})
