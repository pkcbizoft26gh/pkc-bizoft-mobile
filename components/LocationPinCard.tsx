import React, { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { GlassCard } from '@/components/GlassCard'
import { PinConfirmModal } from '@/components/PinConfirmModal'
import { supabase } from '@/lib/supabase'
import { colors, radii } from '@/constants/theme'

// Customer profile card: "Track my address" shows the pin from the phone's GPS
// on a fixed map and saves it once the customer confirms. It updates the saved
// pin and any open job so the technician goes to the right spot.
export function LocationPinCard() {
  const [hasPin, setHasPin] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)

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
              ? 'No pin yet. Tap the button while you are at the place where the internet is installed, check the pin, and confirm it so the technician finds you.'
              : 'Technicians use this pin to find you. If it is wrong, stand at your house and track your address again.'}
          </Text>
        </View>
      </View>

      <Pressable onPress={() => setOpen(true)} style={({ pressed }) => [styles.button, pressed && { opacity: 0.75 }]}>
        <Text style={styles.buttonText}>{hasPin ? 'TRACK MY ADDRESS AGAIN' : 'TRACK MY ADDRESS'}</Text>
      </Pressable>

      <PinConfirmModal visible={open} onClose={() => setOpen(false)} onSaved={() => void load()} />
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
