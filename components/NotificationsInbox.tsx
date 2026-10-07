import { useCallback, useEffect, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'

import { colors, radii, shadows } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

// An in-app inbox built from the customer's own records: payments, plan
// requests and bills. Nothing extra is stored on the server. "Unread" is just
// whatever happened after the last time the inbox was opened on this phone.

const SEEN_KEY = 'inbox-last-seen'
const DAY = 86_400_000

type Tone = 'success' | 'warning' | 'danger' | 'info'

export type InboxItem = {
  id: string
  icon: keyof typeof Ionicons.glyphMap
  tone: Tone
  title: string
  body: string
  at: number
}

const TONE: Record<Tone, string> = {
  success: colors.success,
  warning: colors.medium,
  danger: colors.danger,
  info: colors.accent,
}

function peso(value: number | null | undefined) {
  return `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function when(at: number) {
  const days = Math.floor((Date.now() - at) / DAY)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

async function loadItems(): Promise<InboxItem[]> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return []

  const { data: client } = await supabase.from('clients').select('id').eq('user_id', auth.user.id).maybeSingle()
  if (!client) return []

  const [payments, requests, bills, submissions] = await Promise.all([
    supabase.from('payments').select('id, amount_paid, payment_method, payment_date').eq('client_id', client.id).order('payment_date', { ascending: false }).limit(10),
    supabase.from('service_requests').select('id, request_type, requested_plan, status, created_at, updated_at').eq('client_id', client.id).order('created_at', { ascending: false }).limit(10),
    supabase.from('billing').select('id, bill_id, status, due_date, amount_due').eq('client_id', client.id).order('due_date', { ascending: false }).limit(6),
    supabase.from('payment_submissions').select('id, service_request_id, amount_claimed, payment_method, status, created_at, updated_at, reviewed_at').eq('client_id', client.id).order('created_at', { ascending: false }).limit(10),
  ])

  const items: InboxItem[] = []

  for (const p of payments.data || []) {
    const at = p.payment_date ? new Date(`${p.payment_date}T12:00:00`).getTime() : 0
    if (!at) continue
    items.push({
      id: `pay-${p.id}`,
      icon: 'checkmark-circle',
      tone: 'success',
      title: 'Payment received',
      body: `${peso(p.amount_paid)} by ${p.payment_method || 'payment'} was recorded on your account.`,
      at,
    })
  }

  // Payments the customer sent for Accounting to check. When one belongs to a
  // plan application it replaces the plainer request message below.
  const submittedRequestIds = new Set<string>()

  for (const sub of submissions.data || []) {
    if (sub.service_request_id) submittedRequestIds.add(sub.service_request_id)

    const status = String(sub.status || '').toLowerCase()
    const at = new Date(sub.reviewed_at || sub.updated_at || sub.created_at).getTime()
    const amount = peso(sub.amount_claimed)
    const method = sub.payment_method || 'payment'

    if (status.includes('reject') || status.includes('declin')) {
      items.push({ id: `sub-${sub.id}`, icon: 'close-circle', tone: 'danger', title: 'Payment was not accepted', body: `Accounting could not verify your ${amount} ${method} payment. Check the reference number and receipt, then submit it again in Payment.`, at })
    } else if (status.includes('verif') || status.includes('approv') || status.includes('accept')) {
      items.push({ id: `sub-${sub.id}`, icon: 'checkmark-done-circle', tone: 'success', title: 'Payment verified', body: `Accounting verified your ${amount} ${method} payment. Thank you!`, at })
    } else {
      items.push({ id: `sub-${sub.id}`, icon: 'hourglass', tone: 'warning', title: 'Payment sent for checking', body: `Your ${amount} ${method} payment is waiting for Accounting to check it.`, at })
    }
  }

  for (const r of requests.data || []) {
    if (submittedRequestIds.has(r.id)) continue
    const status = String(r.status || '').toLowerCase()
    const at = new Date(r.updated_at || r.created_at).getTime()
    const label = r.request_type === 'plan_change' ? `Plan change${r.requested_plan ? ` (${r.requested_plan})` : ''}` : 'Your request'

    if (status.includes('cancel') || status.includes('reject')) {
      items.push({ id: `req-${r.id}`, icon: 'close-circle', tone: 'danger', title: `${label} was cancelled`, body: 'If this was not expected, submit it again or ask for help in Requests & Help.', at })
    } else if (status.includes('install')) {
      items.push({ id: `req-${r.id}`, icon: 'construct', tone: 'success', title: `${label} is approved`, body: 'Accounting verified your payment. A technician will install your connection soon - you can follow it under Repair status on Home.', at })
    } else if (status.includes('verif') || status.includes('schedul') || status.includes('paid') || status.includes('approv') || status.includes('complete')) {
      items.push({ id: `req-${r.id}`, icon: 'calendar', tone: 'success', title: `${label} is confirmed`, body: 'Your payment was verified. The plan starts after your current billing period ends.', at })
    } else {
      items.push({ id: `req-${r.id}`, icon: 'time', tone: 'warning', title: `${label} is waiting`, body: 'Accounting is checking your payment. Pull down on Payment to refresh the status.', at })
    }
  }

  for (const b of bills.data || []) {
    const status = String(b.status || '').toLowerCase()
    if (!b.due_date || status === 'paid' || status === 'cancelled' || status === 'void') continue
    const due = new Date(`${b.due_date}T00:00:00`).getTime()
    const days = Math.ceil((due - Date.now()) / DAY)

    if (days < 0) {
      items.push({ id: `bill-${b.id}`, icon: 'alert-circle', tone: 'danger', title: 'Bill overdue', body: `${peso(b.amount_due)} was due ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago. Pay it in the Payment tab.`, at: due })
    } else if (days <= 5) {
      items.push({ id: `bill-${b.id}`, icon: 'receipt', tone: 'warning', title: days === 0 ? 'Bill due today' : `Bill due in ${days} day${days === 1 ? '' : 's'}`, body: `${peso(b.amount_due)} is due. You can pay with GCash in the Payment tab.`, at: Date.now() })
    }
  }

  return items.sort((a, b) => b.at - a.at)
}

/** Loads the inbox and tells you how many items are newer than the last visit. */
export function useInbox() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [next, seen] = await Promise.all([loadItems(), AsyncStorage.getItem(SEEN_KEY)])
      const seenAt = Number(seen || 0)
      setItems(next)
      setUnread(next.filter((item) => item.at > seenAt).length)
    } catch {
      // Keep whatever was shown before.
    } finally {
      setLoading(false)
    }
  }, [])

  const markSeen = useCallback(async () => {
    try {
      await AsyncStorage.setItem(SEEN_KEY, String(Date.now()))
    } catch {
      // Not critical.
    }
    setUnread(0)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { items, unread, loading, refresh, markSeen }
}

export function NotificationsInbox({
  visible,
  onClose,
  items,
  loading,
}: {
  visible: boolean
  onClose: () => void
  items: InboxItem[]
  loading: boolean
}) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Notifications</Text>
            <Pressable onPress={onClose} style={styles.close} accessibilityLabel="Close notifications">
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {items.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={34} color={colors.muted} />
                <Text style={styles.emptyTitle}>{loading ? 'Loading…' : 'Nothing new'}</Text>
                <Text style={styles.emptyText}>Payment updates, plan changes and bill reminders will show up here.</Text>
              </View>
            ) : (
              items.map((item) => (
                <View key={item.id} style={styles.item}>
                  <View style={[styles.itemIcon, { backgroundColor: TONE[item.tone] + '22' }]}>
                    <Ionicons name={item.icon} size={20} color={TONE[item.tone]} />
                  </View>
                  <View style={styles.itemText}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemBody}>{item.body}</Text>
                    <Text style={styles.itemWhen}>{when(item.at)}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 6, 12, 0.6)' },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '78%',
    backgroundColor: colors.panel,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    ...shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, gap: 10 },
  item: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: colors.cardLight,
    borderWidth: 1,
    borderColor: colors.line,
  },
  itemIcon: { width: 40, height: 40, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1 },
  itemTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  itemBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  itemWhen: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 6, opacity: 0.8 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 12 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
})
