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
