import React from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii } from '@/constants/theme'
import { GCASH_QR_IMAGE, saveGcashQr } from '@/lib/gcash'

const STEPS = [
  'Tap "Save QR to gallery" below.',
  'Open the GCash app and tap "QR" (Pay QR).',
  'Tap the gallery icon (Upload QR) and pick the saved PKC BIZOFT QR.',
  'Type the exact amount shown here, then confirm the payment.',
  'Take a screenshot of the GCash receipt. Note the reference number.',
  'Come back to this app, enter the reference number and attach the receipt.',
]

/** The payment QR, a button to save it, and how to pay with it in GCash. */
export function GcashQrCard({ amountText }: { amountText?: string }) {
  return (
    <View style={styles.wrap}>
      {amountText ? <Text style={styles.amount}>{amountText}</Text> : null}

      <View style={styles.frame}>
        <Image source={GCASH_QR_IMAGE} style={styles.image} resizeMode="contain" />
      </View>

      <Pressable
        onPress={() => void saveGcashQr()}
        accessibilityRole="button"
        style={({ pressed }) => [styles.save, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="download-outline" size={18} color={colors.bg} />
        <Text style={styles.saveText}>Save QR to gallery</Text>
      </Pressable>

      <View style={styles.steps}>
        <Text style={styles.stepsTitle}>HOW TO PAY WITH THIS QR</Text>
        {STEPS.map((step, index) => (
          <View key={step} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
        <Text style={styles.note}>Pay the exact amount. Your payment counts only after Accounting checks the receipt.</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: '100%' },
  amount: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 4 },
  frame: { width: 220, height: 220, marginTop: 10, padding: 10, backgroundColor: '#FFFFFF', borderRadius: radii.md },
  image: { width: '100%', height: '100%' },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    minHeight: 46,
    marginTop: 12,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  saveText: { color: colors.bg, fontSize: 13, fontWeight: '900' },
  steps: { alignSelf: 'stretch', marginTop: 14 },
  stepsTitle: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.accentDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: colors.accent, fontSize: 11, fontWeight: '900' },
  stepText: { flex: 1, color: colors.text, fontSize: 12.5, lineHeight: 18 },
  note: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
})
