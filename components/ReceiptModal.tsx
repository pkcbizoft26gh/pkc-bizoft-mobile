import { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii, shadows } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

type Receipt = {
  receipt_number: string | null
  payment_id: string | null
  amount: number | null
  method: string | null
  payment_date: string | null
  customer_name: string | null
  account_id: string | null
  plan: string | null
}

function peso(value: number | null | undefined) {
  return `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function day(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

/** Official-looking receipt for one recorded payment, with a Share button. */
export function ReceiptModal({ paymentUuid, onClose }: { paymentUuid: string | null; onClose: () => void }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!paymentUuid) return
    let cancelled = false
    setReceipt(null)
    setError('')
    setLoading(true)

    supabase.rpc('get_receipt', { p_payment_uuid: paymentUuid }).then(({ data, error: rpcError }) => {
      if (cancelled) return
      setLoading(false)
      if (rpcError) {
        setError(
          /could not find the function/i.test(rpcError.message)
            ? 'Receipts are not available yet. Please try again later.'
            : rpcError.message,
        )
        return
      }
      setReceipt(data as Receipt)
    })

    return () => {
      cancelled = true
    }
  }, [paymentUuid])

  async function share() {
    if (!receipt) return
    const text = [
      'PKC BIZOFT - Payment Receipt',
      `Receipt no: ${receipt.receipt_number || '—'}`,
      `Customer: ${receipt.customer_name || '—'}`,
      `Account: ${receipt.account_id || '—'}`,
      `Plan: ${receipt.plan || '—'}`,
      `Amount: ${peso(receipt.amount)}`,
      `Method: ${receipt.method || '—'}`,
      `Date: ${day(receipt.payment_date)}`,
    ].join('\n')

    try {
      await Share.share({ message: text })
    } catch {
      // Sharing cancelled or unavailable.
    }
  }

  return (
    <Modal visible={!!paymentUuid} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close receipt">
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>

          <View style={styles.badge}>
            <Ionicons name="checkmark-circle" size={34} color={colors.success} />
          </View>
          <Text style={styles.title}>Payment received</Text>
          <Text style={styles.brand}>PKC BIZOFT</Text>

          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 30 }} />
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : receipt ? (
            <>
              <Text style={styles.amount}>{peso(receipt.amount)}</Text>
              <View style={styles.details}>
                <Row label="Receipt no." value={receipt.receipt_number || '—'} />
                <Row label="Customer" value={receipt.customer_name || '—'} />
                <Row label="Account ID" value={receipt.account_id || '—'} />
                <Row label="Plan" value={receipt.plan || '—'} />
                <Row label="Method" value={receipt.method || '—'} />
                <Row label="Date" value={day(receipt.payment_date)} />
              </View>

              <Pressable onPress={share} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                <Ionicons name="share-outline" size={18} color={colors.bg} />
                <Text style={styles.buttonText}>Share receipt</Text>
              </Pressable>
            </>
          ) : null}
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
    paddingHorizontal: 22,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.panel,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: 'center',
    ...shadows.card,
  },
  close: { position: 'absolute', top: 8, right: 8, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.success + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 12 },
  brand: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginTop: 4 },
  amount: { color: colors.text, fontSize: 34, fontWeight: '900', marginTop: 16, letterSpacing: -0.5 },
  details: {
    alignSelf: 'stretch',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 6,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, gap: 12 },
  rowLabel: { color: colors.muted, fontSize: 13 },
  rowValue: { color: colors.text, fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center', marginVertical: 24, lineHeight: 19 },
  button: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    marginTop: 18,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  buttonText: { color: colors.bg, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.75 },
})
