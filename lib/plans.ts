// Plans are stored by price code (G1_P750); customers know them by speed.
const SPEED_BY_PRICE: Record<number, number> = { 750: 50, 1000: 80, 1500: 120, 2000: 200 }

/** Speed in Mbps for a plan name like "G1_P750" -> 50, or null if the plan is not a standard one. */
export function planSpeed(planName: string | null | undefined) {
  const match = /P(\d+)/i.exec(planName || '')
  return match ? (SPEED_BY_PRICE[Number(match[1])] ?? null) : null
}

/** What to show people: "50 Mbps" for G1_P750, otherwise the stored name unchanged. */
export function planLabel(planName: string | null | undefined) {
  const speed = planSpeed(planName)
  return speed ? `${speed} Mbps` : (planName ?? '')
}

/**
 * The day a newly installed customer gets their first monthly bill. The month is fixed, so the
 * install month itself is billed (due on its last day). Same rule as the nightly billing job: the
 * billing day of the install month (the 1st when unset, never past the 28th), or the install day
 * when that is later. Null without a plan.
 */
export function firstBillDate(
  client: { plan_name?: string | null; install_date?: string | null; billing_day?: number | null } | null | undefined,
): string | null {
  if (!client?.plan_name?.trim() || !client.install_date) return null
  const installed = client.install_date.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(installed)) return null
  const day = String(Math.min(client.billing_day ?? 1, 28)).padStart(2, '0')
  const scheduled = `${installed.slice(0, 7)}-${day}`
  return scheduled > installed ? scheduled : installed
}

/** The first bill's due date: the last day of the month it is issued in. */
export function firstBillDue(firstBill: string | null): string | null {
  if (!firstBill) return null
  const [y, m] = firstBill.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${firstBill.slice(0, 7)}-${String(last).padStart(2, '0')}`
}

/**
 * A customer whose installation is not finished yet. They pay only the
 * installation fee (the plan is billed after installation), and their billing stays hidden until the
 * installation is signed off. Same rule as the database.
 */
export function isNewCustomer(client: { account_status?: string | null; installation_status?: string | null } | null | undefined) {
  if (!client) return false
  const account = String(client.account_status || '').trim().toLowerCase()
  const install = String(client.installation_status || 'pending').trim().toLowerCase()
  return account !== 'active' && !['installed', 'completed', 'done'].includes(install)
}
