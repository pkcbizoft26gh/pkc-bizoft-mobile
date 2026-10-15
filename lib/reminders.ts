import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'

import { fetchBills } from '@/lib/billing'
import { supabase } from '@/lib/supabase'

// By default customers are reminded this many days before a bill is due or a
// plan period ends, at 9:00. Both can be changed in the reminder settings.
export const REMINDER_DAYS = 5
const REMINDER_HOUR = 9
const PREFS_KEY = 'reminder-prefs'

export type ReminderPrefs = {
  enabled: boolean
  /** Days before the due date / period end (1 to 7). */
  days: number
  /** Hour of day, 0 to 23, at which the phone notification fires. */
  hour: number
  /** Days of the month (1 to 31, at most two) on which to nudge the customer to set money aside. Empty means off. */
  payday: number[]
}

export const DEFAULT_PREFS: ReminderPrefs = { enabled: true, days: REMINDER_DAYS, hour: REMINDER_HOUR, payday: [] }

// Set while loading bills, so the payday nudge is only scheduled when something is unpaid.
let lastHadOpenBill = false

/** Pure: the next occurrences (this month and next) of the given paydays at `hour`, after `now`. */
export function paydayDates(days: number[], hour: number, now = new Date()): Date[] {
  const out: Date[] = []
  for (const day of days) {
    for (let offset = 0; offset < 2; offset += 1) {
      const monthLength = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0).getDate()
      const date = new Date(now.getFullYear(), now.getMonth() + offset, Math.min(day, monthLength), hour, 0, 0, 0)
      if (date > now) out.push(date)
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime())
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export async function loadReminderPrefs(): Promise<ReminderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw)
    return {
      enabled: parsed.enabled !== false,
      days: clamp(parsed.days, 1, 7, DEFAULT_PREFS.days),
      hour: clamp(parsed.hour, 0, 23, DEFAULT_PREFS.hour),
      payday: Array.isArray(parsed.payday)
        ? [...new Set<number>(parsed.payday.map((d: unknown) => clamp(d, 1, 31, 0)).filter((d: number) => d > 0))].slice(0, 2)
        : [],
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export async function saveReminderPrefs(prefs: ReminderPrefs) {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  // Forget "already shown today" markers so the new settings take effect now.
  const keys = await AsyncStorage.getAllKeys()
  const shown = keys.filter((key) => key.startsWith(SHOWN_PREFIX))
  if (shown.length) await AsyncStorage.multiRemove(shown)
}
const CHANNEL_ID = 'billing-reminders'
const SHOWN_PREFIX = 'reminder-shown:'

export type Reminder = {
  id: string
  kind: 'bill' | 'plan'
  title: string
  body: string
  daysLeft: number
  /** The calendar day the event happens (local midnight). */
  eventDate: Date
}

type BillRow = {
  id: string
  bill_id: string | null
  status: string | null
  due_date: string | null
  billing_period_end: string | null
  /** What is still owed on the bill (after partial payments). */
  balance: number | null
}

// 'YYYY-MM-DD' as a local date (avoids the UTC shift of new Date('YYYY-MM-DD')).
function parseDay(value: string | null): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '')
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function daysBetween(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

const peso = (n: number | null) =>
  n == null ? '' : ` of ₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const dayWord = (n: number) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)

const isSettled = (status: string | null) => /^(paid|cancel|void|waive)/i.test(status ?? '')

/** Pure: which reminders apply today. Exported for easy testing. */
export function buildReminders(bills: BillRow[], today = startOfToday(), days = REMINDER_DAYS): Reminder[] {
  const reminders: Reminder[] = []

  for (const bill of bills) {
    const due = parseDay(bill.due_date)
    if (due && !isSettled(bill.status)) {
      const daysLeft = daysBetween(today, due)
      if (daysLeft >= 0 && daysLeft <= days) {
        reminders.push({
          id: `bill-${bill.id}`,
          kind: 'bill',
          title: `Bill due ${dayWord(daysLeft)}`,
          body: `Your bill${bill.bill_id ? ` ${bill.bill_id}` : ''}${peso(bill.balance)} is due on ${due.toDateString()}. Pay early to keep your connection active.`,
          daysLeft,
          eventDate: due,
        })
      }
    }
  }

  // The plan period that covers "now" ends on the latest billing_period_end.
  const periodEnd = bills
    .map((b) => ({ bill: b, end: parseDay(b.billing_period_end) }))
    .filter((x): x is { bill: BillRow; end: Date } => x.end !== null && x.end >= today)
    .sort((a, b) => a.end.getTime() - b.end.getTime())[0]

  if (periodEnd) {
    const daysLeft = daysBetween(today, periodEnd.end)
    if (daysLeft <= days) {
      reminders.push({
        id: `plan-${periodEnd.bill.id}`,
        kind: 'plan',
        title: `Your plan period ends ${dayWord(daysLeft)}`,
        body: `Your current billing period ends on ${periodEnd.end.toDateString()}. Settle your next bill on time to avoid interruption.`,
        daysLeft,
        eventDate: periodEnd.end,
      })
    }
  }

  return reminders.sort((a, b) => a.daysLeft - b.daysLeft)
}

/** Loads the signed-in customer's bills and returns the reminders due now. */
export async function loadReminders(): Promise<Reminder[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: client } = await supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle()
  if (!client) return []

  try {
    const prefs = await loadReminderPrefs()
    if (!prefs.enabled) return []
    const bills = (await fetchBills(client.id)).slice(0, 12)
    lastHadOpenBill = bills.some((bill) => !isSettled(bill.status))
    return buildReminders(
      bills.map((bill) => ({
        id: bill.id,
        bill_id: bill.bill_id,
        status: bill.status,
        due_date: bill.due_date,
        billing_period_end: bill.billing_period_end,
        balance: bill.balance,
      })),
      startOfToday(),
      prefs.days,
    )
  } catch {
    return []
  }
}

let handlerSet = false

function ensureHandler() {
  if (handlerSet) return
  handlerSet = true
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      // The in-app banner (components/InAppBanner.tsx) shows foreground alerts.
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  })
}

async function ensurePermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Billing reminders',
      importance: Notifications.AndroidImportance.HIGH,
    })
  }
  const current = await Notifications.getPermissionsAsync()
  if (current.granted) return true
  if (!current.canAskAgain) return false
  const asked = await Notifications.requestPermissionsAsync()
  return asked.granted
}

/**
 * Makes the phone's notifications match the customer's bills:
 *  - each upcoming bill/plan end gets a notification 5 days before, at 9:00;
 *  - if that moment has already passed (the bill was created inside the
 *    5-day window), one notification is shown right away, once per day.
 * Safe to call on every app open; it replaces the previous schedule.
 */
export async function syncReminderNotifications(reminders: Reminder[]) {
  try {
    ensureHandler()
    const prefs = await loadReminderPrefs()
    if (!(await ensurePermission())) return

    await Notifications.cancelAllScheduledNotificationsAsync()
    if (!prefs.enabled) return

    const now = new Date()
    const todayKey = startOfToday().toISOString().slice(0, 10)

    // Payday nudge: only while a bill is unpaid, so it never nags a customer who is up to date.
    if (prefs.payday.length > 0 && lastHadOpenBill) {
      for (const date of paydayDates(prefs.payday, prefs.hour, now)) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Payday reminder',
            body: 'Set aside your internet bill today so it is paid before the due date.',
            data: { reminderId: 'payday' },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: CHANNEL_ID },
        })
      }
    }

    for (const reminder of reminders) {
      const content = { title: reminder.title, body: reminder.body, data: { reminderId: reminder.id } }
      const fireAt = new Date(reminder.eventDate)
      fireAt.setDate(fireAt.getDate() - prefs.days)
      fireAt.setHours(prefs.hour, 0, 0, 0)

      if (fireAt > now) {
        await Notifications.scheduleNotificationAsync({
          content,
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: CHANNEL_ID },
        })
        continue
      }

      // Already inside the window: remind once per day.
      const shownKey = `${SHOWN_PREFIX}${reminder.id}`
      if ((await AsyncStorage.getItem(shownKey)) === todayKey) continue
      await AsyncStorage.setItem(shownKey, todayKey)
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, channelId: CHANNEL_ID },
      })
    }
  } catch (error) {
    // Reminders are a convenience; never break the screen because of them.
    console.warn('Could not sync reminders:', error)
  }
}
