import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Alert } from '@/components/AppAlert'
import { colors, radii } from '@/constants/theme'
import {
  BillRow,
  PayMethod,
  canPay,
  formatDay,
  normalizeMobile,
  payableAmount,
  peso,
  shiftDay,
  todayPH,
  uploadReceipt,
} from '@/lib/billing'
import { isNetworkError, useConnection } from '@/lib/connection'
import { GCASH_QR_IMAGE, openGcashApp } from '@/lib/gcash'
import { supabase } from '@/lib/supabase'

export type PayPrefill = {
  method?: PayMethod
  mobile?: string | null
  bank?: string | null
}

type Props = {
  visible: boolean
  /** Bills of this customer; only the ones that can still be paid are offered. */
  bills: BillRow[]
  initialBillId: string | null
  clientId: string
  /** Mobile number on the account, used as the GCash number to start with. */
  accountMobile: string | null
  prefill?: PayPrefill | null
  onClose: () => void
  /** Called after Accounting has been sent the payment, so the screen can reload. */
  onSubmitted: () => void
}

const METHODS: { key: PayMethod; icon: keyof typeof Ionicons.glyphMap }[] = [
  // GCash is the only way to pay in the app for now. Bank Transfer and Cash are
  // still accepted by the database; add them back here to offer them again.
  { key: 'GCash', icon: 'phone-portrait-outline' },
]

/** Bottom sheet where a customer sends proof of payment for a monthly bill. */
export function PayBillSheet({
  visible,
  bills,
  initialBillId,
  clientId,
  accountMobile,
  prefill,
  onClose,
  onSubmitted,
}: Props) {
  const insets = useSafeAreaInsets()
  const { isOnline, recheck, reportNetworkFailure } = useConnection()

  const payable = useMemo(() => bills.filter(canPay), [bills])

  const [billId, setBillId] = useState<string | null>(null)
  const [amountText, setAmountText] = useState('')
  const [method, setMethod] = useState<PayMethod>('GCash')
  const [mobile, setMobile] = useState('')
  const [bank, setBank] = useState('')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(todayPH())
  const [customDate, setCustomDate] = useState(false)
  const [proofUri, setProofUri] = useState<string | null>(null)
  const [proofName, setProofName] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const bill = payable.find((item) => item.id === billId) ?? null
  const amount = Number(amountText.replace(/,/g, '').trim())
  const maxAmount = bill ? payableAmount(bill) : 0

  // Start fresh every time the sheet opens. (Only `visible` matters here:
  // reloading the bills in the background must not wipe what is being typed.)
  useEffect(() => {
    if (!visible) return
    const first = payable.find((item) => item.id === initialBillId) ?? payable[0] ?? null
    setBillId(first?.id ?? null)
    setAmountText(first ? payableAmount(first).toFixed(2) : '')
    setMethod('GCash')
    setMobile(prefill?.mobile || normalizeMobile(accountMobile) || '')
    setBank(prefill?.bank || '')
    setReference('')
    setDate(todayPH())
    setCustomDate(false)
    setProofUri(null)
    setProofName('')
    setShowQr(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  function chooseBill(next: BillRow) {
    setBillId(next.id)
    setAmountText(payableAmount(next).toFixed(2))
  }

  const today = todayPH()
  const dateChips = [
    { label: 'Today', value: today },
    { label: 'Yesterday', value: shiftDay(today, -1) },
    { label: '2 days ago', value: shiftDay(today, -2) },
  ]

  async function pickReceipt() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Photo permission required', 'Allow photo access so you can attach your receipt.')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
      })
      if (result.canceled || !result.assets?.[0]?.uri) return

      const asset = result.assets[0]
      setProofUri(asset.uri)
      setProofName(asset.fileName || `receipt-${Date.now()}.jpg`)
    } catch {
      Alert.alert('Could not open your photos', 'Please try again.')
    }
  }

  function problem(): string | null {
    if (!bill) return 'Choose the bill you are paying.'
    if (!Number.isFinite(amount) || amount <= 0) return 'Enter the amount you paid.'
    if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) return 'Use at most 2 decimal places.'
    if (amount > maxAmount + 0.0001) return `You can pay up to ${peso(maxAmount)} for this bill.`
    if (method === 'GCash' && !normalizeMobile(mobile)) {
      return 'Enter the GCash mobile number you paid from, for example 09123456789.'
    }
    if (method === 'Bank Transfer' && !bank.trim()) return 'Enter the bank name.'
    if (method !== 'Cash' && !reference.trim()) {
      return method === 'GCash'
        ? 'Enter the reference number shown on your GCash receipt.'
        : 'Enter the bank transfer reference number.'
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
      return 'Enter the payment date as YYYY-MM-DD.'
    }
    if (date > today) return "The payment date can't be in the future."
    if (date < shiftDay(today, -365)) return 'The payment date is too far in the past.'
    if (!proofUri) return 'Attach a photo of your receipt so Accounting can check the payment.'
    return null
  }

  async function review() {
    if (submitting) return
    const issue = problem()
    if (issue) {
      Alert.alert('Check your payment', issue)
      return
    }
    if (!isOnline || !(await recheck())) {
      Alert.alert('No internet connection', 'Please reconnect, then send your payment again.')
      return
    }

    Alert.alert(
      'Send payment for checking?',
      `${peso(amount)} for bill ${bill?.bill_id || ''} by ${method}.\n\nAccounting checks your receipt, then your bill is updated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: () => void send() },
      ],
    )
  }

  async function send() {
    if (!bill || !proofUri) return
    setSubmitting(true)

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('Please sign in again.')

      const proofPath = await uploadReceipt(user.id, clientId, proofUri, proofName)

      const { error } = await supabase.rpc('submit_bill_payment', {
        p_billing_id: bill.id,
        p_amount: Math.round(amount * 100) / 100,
        p_payment_method: method,
        p_reference_number: reference.trim() || null,
        p_bank_name: method === 'Bank Transfer' ? bank.trim() : null,
        p_gcash_mobile: method === 'GCash' ? normalizeMobile(mobile) : null,
        p_payment_date: date,
        p_payment_proof_path: proofPath,
      })
      if (error) throw error

      onClose()
      onSubmitted()
      Alert.alert(
        'Payment sent',
        'Accounting will check your receipt. We will notify you when it is verified, and your bill updates then.',
      )
    } catch (error: any) {
      if (isNetworkError(error)) {
        reportNetworkFailure()
        Alert.alert(
          'Connection lost',
          'We could not confirm that your payment was sent. Look under "Sent to Accounting" before trying again.',
        )
        return
      }
      const message = String(error?.message || '')
      Alert.alert(
        'Could not send payment',
        /could not find the function/i.test(message)
          ? 'Bill payments are not available yet. Please try again later.'
          : message || 'Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !submitting && onClose()}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.dismiss} onPress={() => !submitting && onClose()} />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>PAY A BILL</Text>
              <Text style={styles.title}>{bill?.bill_id || 'No bill to pay'}</Text>
              {bill ? (
                <Text style={styles.subtitle}>
                  {bill.due_date ? `Due ${formatDay(bill.due_date)} · ` : ''}
                  {peso(bill.balance)} left
                  {bill.paid > 0 ? ` (${peso(bill.paid)} already paid)` : ''}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={() => !submitting && onClose()} style={styles.close} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          {!bill ? (
            <View style={styles.emptyBox}>
              <Ionicons name="checkmark-circle" size={34} color={colors.success} />
              <Text style={styles.emptyTitle}>Nothing to pay right now</Text>
              <Text style={styles.emptyText}>
                Your bills are paid, or a payment for them is already waiting for Accounting.
              </Text>
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.body}
            >
              {payable.length > 1 ? (
                <>
                  <Text style={styles.label}>WHICH BILL</Text>
                  <View style={styles.chipRow}>
                    {payable.map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => chooseBill(item)}
                        style={[styles.chip, item.id === bill.id && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, item.id === bill.id && styles.chipTextOn]}>
                          {`${item.bill_id || 'Bill'} · ${peso(item.balance)}`}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <Text style={styles.label}>AMOUNT YOU PAID</Text>
              <View style={styles.amountRow}>
                <Text style={styles.currency}>{'₱'}</Text>
                <TextInput
                  value={amountText}
                  onChangeText={setAmountText}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                  style={styles.amountInput}
                />
                {Math.abs(amount - maxAmount) > 0.004 ? (
                  <Pressable onPress={() => setAmountText(maxAmount.toFixed(2))} style={styles.fullChip}>
                    <Text style={styles.fullChipText}>Pay all {peso(maxAmount)}</Text>
                  </Pressable>
                ) : null}
              </View>
              {amount > 0 && amount < maxAmount - 0.004 ? (
                <Text style={styles.hint}>
                  This is a partial payment. {peso(maxAmount - amount)} will stay on the bill.
                </Text>
              ) : null}

              <Text style={styles.label}>HOW YOU PAID</Text>
              <View style={styles.chipRow}>
                {METHODS.map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => setMethod(item.key)}
                    style={[styles.method, method === item.key && styles.chipOn]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={16}
                      color={method === item.key ? colors.accent : colors.muted}
                    />
                    <Text style={[styles.chipText, method === item.key && styles.chipTextOn]}>{item.key}</Text>
                  </Pressable>
                ))}
              </View>

              {method === 'GCash' ? (
                <View style={styles.qrBox}>
                  <Pressable onPress={() => setShowQr((value) => !value)} style={styles.qrToggle}>
                    <Ionicons name="qr-code-outline" size={20} color={colors.accent} />
                    <Text style={styles.qrToggleText}>
                      {showQr ? 'Hide the GCash QR' : 'Not paid yet? Show the GCash QR'}
                    </Text>
                    <Ionicons name={showQr ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
                  </Pressable>
                  {showQr ? (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={styles.qrAmount}>{peso(amount > 0 ? amount : maxAmount)}</Text>
                      <View style={styles.qrFrame}>
                        <Image source={GCASH_QR_IMAGE} style={styles.qrImage} resizeMode="contain" />
                      </View>
                      <Text style={styles.hint}>
                        Scan this in GCash and pay the exact amount, then come back here and fill in your receipt.
                      </Text>
                      <Pressable onPress={() => void openGcashApp()} style={styles.openGcash}>
                        <Ionicons name="phone-portrait-outline" size={17} color={colors.bg} />
                        <Text style={styles.openGcashText}>Open GCash</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {method === 'GCash' ? (
                <>
                  <Text style={styles.label}>YOUR GCASH NUMBER</Text>
                  <TextInput
                    value={mobile}
                    onChangeText={setMobile}
                    keyboardType="phone-pad"
                    placeholder="09XXXXXXXXX"
                    placeholderTextColor={colors.muted}
                    maxLength={14}
                    style={styles.input}
                  />
                </>
              ) : null}

              {method === 'Bank Transfer' ? (
                <>
                  <Text style={styles.label}>BANK NAME</Text>
                  <TextInput
                    value={bank}
                    onChangeText={setBank}
                    placeholder="e.g. BPI, BDO, Metrobank"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="words"
                    style={styles.input}
                  />
                </>
              ) : null}

              <Text style={styles.label}>
                {method === 'Cash' ? 'RECEIPT NUMBER (OPTIONAL)' : 'REFERENCE NUMBER ON YOUR RECEIPT'}
              </Text>
              <TextInput
                value={reference}
                onChangeText={setReference}
                autoCapitalize="characters"
                placeholder={method === 'Cash' ? 'If the collector gave you one' : 'e.g. 1234 567 890123'}
                placeholderTextColor={colors.muted}
                style={styles.input}
              />

              <Text style={styles.label}>WHEN YOU PAID</Text>
              <View style={styles.chipRow}>
                {dateChips.map((chip) => (
                  <Pressable
                    key={chip.label}
                    onPress={() => {
                      setDate(chip.value)
                      setCustomDate(false)
                    }}
                    style={[styles.chip, !customDate && date === chip.value && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, !customDate && date === chip.value && styles.chipTextOn]}>
                      {chip.label}
                    </Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => setCustomDate(true)} style={[styles.chip, customDate && styles.chipOn]}>
                  <Text style={[styles.chipText, customDate && styles.chipTextOn]}>Other date</Text>
                </Pressable>
              </View>
              {customDate ? (
                <TextInput
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  style={[styles.input, { marginTop: 8 }]}
                />
              ) : (
                <Text style={styles.hint}>{formatDay(date)}</Text>
              )}

              <Text style={styles.label}>PHOTO OF YOUR RECEIPT</Text>
              <Pressable onPress={pickReceipt} style={styles.upload}>
                <Ionicons name="cloud-upload-outline" size={19} color={colors.accent} />
                <Text style={styles.uploadText}>{proofUri ? 'Choose a different photo' : 'Upload your receipt'}</Text>
              </Pressable>
              {proofUri ? (
                <View style={styles.preview}>
                  <Image source={{ uri: proofUri }} style={styles.previewImage} resizeMode="cover" />
                  <Text style={styles.proofName} numberOfLines={1}>
                    {proofName}
                  </Text>
                </View>
              ) : (
                <Text style={styles.hint}>A clear screenshot or photo showing the amount, date and reference number.</Text>
              )}

              <View style={styles.notice}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.info} />
                <Text style={styles.noticeText}>
                  Your bill is only marked paid after Accounting verifies the receipt. Please don't send a receipt that isn't yours.
                </Text>
              </View>

              <Pressable
                onPress={() => void review()}
                disabled={submitting}
                style={({ pressed }) => [styles.submit, (pressed || submitting) && { opacity: 0.7 }]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={colors.bg} />
                ) : (
                  <Ionicons name="paper-plane-outline" size={18} color={colors.bg} />
                )}
                <Text style={styles.submitText}>{submitting ? 'Sending…' : 'Send for checking'}</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const FIELD_BG = '#102744'
const FIELD_BORDER = '#2E4D70'

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 6, 12, 0.7)' },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.panel,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 22, fontWeight: '900', marginTop: 3 },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  close: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20, paddingBottom: 18 },
  label: { color: '#BFD4EA', fontSize: 11, fontWeight: '800', letterSpacing: 0.7, marginTop: 16, marginBottom: 7 },
  hint: { color: '#8FA8C2', fontSize: 11, lineHeight: 16, marginTop: 7 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    backgroundColor: FIELD_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  method: {
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    backgroundColor: FIELD_BG,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: '#17385C' },
  chipText: { color: '#B8CCE3', fontSize: 12, fontWeight: '800' },
  chipTextOn: { color: '#FFFFFF' },
  amountRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    backgroundColor: FIELD_BG,
    gap: 8,
  },
  currency: { color: colors.accent, fontSize: 20, fontWeight: '900' },
  amountInput: { flex: 1, color: '#F3F8FF', fontSize: 20, fontWeight: '800', paddingVertical: 8 },
  fullChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radii.round,
    backgroundColor: colors.overlay,
    borderWidth: 1,
    borderColor: colors.accentDark,
  },
  fullChipText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  input: {
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: FIELD_BORDER,
    backgroundColor: FIELD_BG,
    color: '#F3F8FF',
    paddingHorizontal: 13,
    fontSize: 14,
    fontWeight: '600',
  },
  qrBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.28)',
    backgroundColor: 'rgba(0, 229, 255, 0.06)',
  },
  qrToggle: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  qrToggleText: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '800' },
  qrAmount: { color: colors.accent, fontSize: 26, fontWeight: '900', marginTop: 12 },
  qrFrame: { width: 220, height: 220, marginTop: 10, padding: 10, backgroundColor: '#FFFFFF', borderRadius: radii.md },
  qrImage: { width: '100%', height: '100%' },
  openGcash: {
    minHeight: 44,
    marginTop: 10,
    paddingHorizontal: 18,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  openGcashText: { color: colors.bg, fontSize: 12, fontWeight: '900' },
  upload: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#31577D',
    backgroundColor: '#102B49',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  uploadText: { color: '#DCEBFA', fontSize: 12, fontWeight: '800' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  previewImage: { width: 54, height: 54, borderRadius: radii.xs, backgroundColor: colors.input },
  proofName: { flex: 1, color: colors.success, fontSize: 11 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 18,
    padding: 11,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  noticeText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16 },
  submit: {
    minHeight: 50,
    marginTop: 16,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitText: { color: colors.bg, fontSize: 14, fontWeight: '900' },
  emptyBox: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 10 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
})
