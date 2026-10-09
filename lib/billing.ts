import { supabase } from '@/lib/supabase'

// One place that knows how a bill's amount, payments and balance fit together,
// so Home, Plan & Bills, reminders and the inbox always agree.

export type PayMethod = 'GCash' | 'Bank Transfer' | 'Cash'

export type BillRow = {
  id: string
  bill_id: string | null
  bill_type: string | null
  bill_date: string | null
  due_date: string | null
  billing_period_start: string | null
  billing_period_end: string | null
  /** What the bill is worth (after any discount). */
  amount: number
  /** Confirmed payments so far. */
  paid: number
  /** What is still owed. */
  balance: number
  /** Sent to Accounting but not checked yet. */
  pending_review: number
  /** Paid, Partially Paid, Overdue, Unpaid or Cancelled. */
  status: string
  days_overdue: number
  closed: boolean
}

export type Submission = {
  id: string
  billing_id: string | null
  service_request_id: string | null
  amount_claimed: number
  payment_method: string
  reference_number: string | null
  payment_date: string | null
  status: string
  reject_reason: string | null
  reject_note: string | null
  created_at: string
  reviewed_at: string | null
  bank_name?: string | null
  gcash_mobile?: string | null
}

export type Plan = {
  name: string
  price: number
  speed: string | null
  description: string
}

// ---------------------------------------------------------------- formatting

export function peso(value: number | null | undefined) {
  return `₱${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Accepts 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX or +639XXXXXXXXX and returns the 09XXXXXXXXX form. */
export function normalizeMobile(value: string | null | undefined) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('63')) digits = `0${digits.slice(2)}`
  else if (digits.length === 10 && digits.startsWith('9')) digits = `0${digits}`
  return /^09\d{9}$/.test(digits) ? digits : null
}

// ---------------------------------------------------------------------- dates

/** Today in the Philippines as YYYY-MM-DD, whatever time zone the phone is set to. */
export function todayPH() {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
}

export function shiftDay(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string) {
  const a = from.split('-').map(Number)
  const b = to.split('-').map(Number)
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000)
}

export function formatDay(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------- bills

export const isOpen = (bill: BillRow) => !bill.closed && bill.balance > 0

/** The most the customer can still send for this bill (what is waiting is already counted). */
export const payableAmount = (bill: BillRow) =>
  Math.max(Math.round((bill.balance - bill.pending_review) * 100) / 100, 0)

export const canPay = (bill: BillRow) => isOpen(bill) && payableAmount(bill) > 0

/** Unpaid bills first, the one due soonest on top. */
export function openBills(bills: BillRow[]) {
  return bills
    .filter(isOpen)
    .sort((a, b) => String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')))
}

export function totalBalance(bills: BillRow[]) {
  return Math.round(bills.filter(isOpen).reduce((sum, bill) => sum + bill.balance, 0) * 100) / 100
}

function fromView(row: Record<string, unknown>): BillRow {
  return {
    id: String(row.id),
    bill_id: (row.bill_id as string) ?? null,
    bill_type: (row.bill_type as string) ?? null,
    bill_date: (row.bill_date as string) ?? null,
    due_date: (row.due_date as string) ?? null,
    billing_period_start: (row.billing_period_start as string) ?? null,
    billing_period_end: (row.billing_period_end as string) ?? null,
    amount: Number(row.amount ?? 0),
    paid: Number(row.paid ?? 0),
    balance: Number(row.balance ?? 0),
    pending_review: Number(row.pending_review ?? 0),
    status: String(row.status ?? 'Unpaid'),
    days_overdue: Number(row.days_overdue ?? 0),
    closed: Boolean(row.closed),
  }
}

/**
 * Works the same numbers out from the raw tables. Used only when the database
 * does not have the billing_balances view yet.
 */
async function billsFromRawTables(clientId: string): Promise<BillRow[]> {
  const [bills, payments] = await Promise.all([
    supabase
      .from('billing')
      .select(
        'id, bill_id, bill_type, bill_date, due_date, billing_period_start, billing_period_end, status, amount_due, original_amount, final_amount',
      )
      .eq('client_id', clientId)
      .order('due_date', { ascending: false }),
    supabase.from('payments').select('billing_id, amount_paid').eq('client_id', clientId),
  ])
  if (bills.error) throw bills.error

  const paidByBill = new Map<string, number>()
  for (const payment of payments.data || []) {
    if (!payment.billing_id || !(Number(payment.amount_paid) > 0)) continue
    paidByBill.set(payment.billing_id, (paidByBill.get(payment.billing_id) || 0) + Number(payment.amount_paid))
  }

  const today = todayPH()
  return (bills.data || []).map((bill) => {
    const amount = Number(bill.final_amount ?? bill.amount_due ?? bill.original_amount ?? 0)
    const paid = paidByBill.get(bill.id) || 0
    const balance = Math.max(Math.round((amount - paid) * 100) / 100, 0)
    const closed = /^(cancel|void|waive)/i.test(bill.status || '')
    const overdue = !closed && balance > 0 && !!bill.due_date && bill.due_date < today
    return {
      id: bill.id,
      bill_id: bill.bill_id,
      bill_type: bill.bill_type,
      bill_date: bill.bill_date,
      due_date: bill.due_date,
      billing_period_start: bill.billing_period_start,
      billing_period_end: bill.billing_period_end,
      amount,
      paid,
      balance,
      pending_review: 0,
      status: closed ? bill.status || 'Cancelled' : balance <= 0 ? 'Paid' : overdue ? 'Overdue' : paid > 0 ? 'Partially Paid' : 'Unpaid',
      days_overdue: overdue ? daysBetween(bill.due_date as string, today) : 0,
      closed,
    }
  })
}

/** The customer's bills, newest due date first, with what was paid and what is left. */
export async function fetchBills(clientId: string): Promise<BillRow[]> {
  const { data, error } = await supabase
    .from('billing_balances')
    .select('*')
    .eq('client_id', clientId)
    .order('due_date', { ascending: false })

  if (!error) return (data || []).map(fromView)
  return billsFromRawTables(clientId)
}

/** Payments the customer sent for Accounting to check, newest first. */
export async function fetchSubmissions(clientId: string, limit = 30): Promise<Submission[]> {
  const full =
    'id, billing_id, service_request_id, amount_claimed, payment_method, reference_number, payment_date, status, reject_reason, reject_note, created_at, reviewed_at, bank_name, gcash_mobile'
  const legacy =
    'id, service_request_id, amount_claimed, payment_method, reference_number, payment_date, status, reject_reason, reject_note, created_at, reviewed_at, bank_name'

  const first = await supabase
    .from('payment_submissions')
    .select(full)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)

  let rows = first.data as unknown as Record<string, unknown>[] | null
  let error = first.error

  // An older database has no billing_id / gcash_mobile columns yet.
  if (error) {
    const second = await supabase
      .from('payment_submissions')
      .select(legacy)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(limit)
    rows = second.data as unknown as Record<string, unknown>[] | null
    error = second.error
  }
  if (error) throw error

  return (rows || []).map((row) => ({
    id: String(row.id),
    billing_id: (row.billing_id as string) ?? null,
    service_request_id: (row.service_request_id as string) ?? null,
    amount_claimed: Number(row.amount_claimed ?? 0),
    payment_method: String(row.payment_method ?? ''),
    reference_number: (row.reference_number as string) ?? null,
    payment_date: (row.payment_date as string) ?? null,
    status: String(row.status ?? 'Pending'),
    reject_reason: (row.reject_reason as string) ?? null,
    reject_note: (row.reject_note as string) ?? null,
    created_at: String(row.created_at),
    reviewed_at: (row.reviewed_at as string) ?? null,
    bank_name: (row.bank_name as string) ?? null,
    gcash_mobile: (row.gcash_mobile as string) ?? null,
  }))
}

// ---------------------------------------------------------------------- plans

const PLAN_TEXT: Record<string, string> = {
  G1_P750: 'Reliable internet service for everyday household use.',
  G1_P1000: 'Higher-speed service for streaming and multiple devices.',
  G1_P1500: 'High-performance internet for demanding users.',
  G1_P2000: 'Premium internet service for demanding usage.',
}

// Shown until the live plan list arrives, or if it cannot be loaded (offline).
export const DEFAULT_PLANS: Plan[] = [
  { name: 'G1_P750', price: 750, speed: null, description: PLAN_TEXT.G1_P750 },
  { name: 'G1_P1000', price: 1000, speed: null, description: PLAN_TEXT.G1_P1000 },
  { name: 'G1_P1500', price: 1500, speed: null, description: PLAN_TEXT.G1_P1500 },
  { name: 'G1_P2000', price: 2000, speed: null, description: PLAN_TEXT.G1_P2000 },
]

/** The plans Accounting currently sells, cheapest first. */
export async function fetchPlans(): Promise<{ plans: Plan[]; live: boolean }> {
  try {
    const { data, error } = await supabase.rpc('list_plans')
    if (!error && Array.isArray(data) && data.length > 0) {
      return {
        live: true,
        plans: data.map((row: { plan_name: string; price: number | string; speed: string | null }) => ({
          name: row.plan_name,
          price: Number(row.price),
          speed: row.speed ?? null,
          description: PLAN_TEXT[row.plan_name] || (row.speed ? `Internet service up to ${row.speed}.` : 'Home internet service.'),
        })),
      }
    }
  } catch {
    // Fall through to the built-in list.
  }
  return { plans: DEFAULT_PLANS, live: false }
}

// ------------------------------------------------------------------- receipts

/** Upload folder rule from the database: <user id>/<client id>/<file>. */
export async function uploadReceipt(userId: string, clientId: string, uri: string, fileName: string) {
  const response = await fetch(uri)
  const bytes = await response.arrayBuffer()
  const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg'
  const contentType = extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg'
  const path = `${userId}/${clientId}/${Date.now()}-payment-proof.${extension === 'png' || extension === 'webp' ? extension : 'jpg'}`

  const { error } = await supabase.storage.from('payment-proofs').upload(path, bytes, { contentType, upsert: false })
  if (error) throw error
  return path
}
