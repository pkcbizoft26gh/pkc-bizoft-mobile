/** One-time installation fee, in pesos, charged on top of the first month. */
export const INSTALL_FEE = 750

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
 * The day a newly installed customer gets their first monthly bill. The first
 * month is paid together with the plan, so nothing is due until then. Same rule
 * as the nightly billing job: the billing day (or the install day, never past
 * the 28th) of the first month after the install date. Null without a plan.
 */
export function firstBillDate(
  client: { plan_name?: string | null; install_date?: string | null; billing_day?: number | null } | null | undefined,
): string | null {
  if (!client?.plan_name?.trim() || !client.install_date) return null
  const installed = new Date(`${client.install_date}T00:00:00`)
  if (Number.isNaN(installed.getTime())) return null
  const day = Math.min(client.billing_day ?? installed.getDate(), 28)
  let next = new Date(installed.getFullYear(), installed.getMonth(), day)
  if (next <= installed) next = new Date(installed.getFullYear(), installed.getMonth() + 1, day)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`
}

/**
 * A customer whose installation is not finished yet. They pay the first month
 * together with the installation fee, and their billing stays hidden until the
 * installation is signed off. Same rule as the database.
 */
export function isNewCustomer(client: { account_status?: string | null; installation_status?: string | null } | null | undefined) {
  if (!client) return false
  const account = String(client.account_status || '').trim().toLowerCase()
  const install = String(client.installation_status || 'pending').trim().toLowerCase()
  return account !== 'active' && !['installed', 'completed', 'done'].includes(install)
}
