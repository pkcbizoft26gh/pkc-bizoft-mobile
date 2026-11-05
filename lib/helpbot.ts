// Pure, dependency-free helpers for the customer HelpBot: typo/Bisaya-tolerant
// topic matching, and formatters that turn the customer's real account data into
// a plain answer. No React/Supabase imports here so this stays unit-testable.

export type MatchTopic = { id: string; keywords: string[] }

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Common Bisaya/Tagalog words mapped to an English word that appears in the
// topic keywords, so "wala koy internet" or "pila ang bayad" still match.
const SYNONYMS: Record<string, string> = {
  wala: 'no', walay: 'no', wla: 'no', way: 'no', dili: 'no', indi: 'no',
  hinay: 'slow', mahinay: 'slow', bagal: 'slow', mabagal: 'slow',
  bayad: 'pay', magbayad: 'pay', bayaran: 'pay', nagbayad: 'paid', bayronon: 'bill',
  pila: 'price', tagpila: 'price', magkano: 'price', presyo: 'price',
  giunsa: 'how', unsaon: 'how', paano: 'how', unsa: 'what',
  konek: 'connection', koneksyon: 'connection', signal: 'internet', net: 'internet',
  guba: 'broken', naguba: 'broken', sira: 'broken', nasira: 'broken',
  tabang: 'help', tao: 'human', istorya: 'talk', kausap: 'talk',
}

function expand(tokens: string[]): string[] {
  const out: string[] = []
  for (const t of tokens) {
    out.push(t)
    if (SYNONYMS[t]) out.push(SYNONYMS[t])
  }
  return out
}

function lev(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
    }
  }
  return d[m][n]
}

// Best-matching topic id for a free-text question, or null if nothing matches.
// Phrase keywords score higher; single words tolerate a 1-char typo.
export function matchTopicId(input: string, topics: MatchTopic[]): string | null {
  const text = normalize(input)
  if (!text) return null
  const toks = expand(text.split(' ').filter(Boolean))
  let best: { id: string; score: number } | null = null
  for (const topic of topics) {
    let score = 0
    for (const raw of topic.keywords) {
      const k = normalize(raw)
      if (!k) continue
      if (k.includes(' ')) {
        if (text.includes(k)) score += 3
      } else {
        for (const tok of toks) {
          if (tok === k) { score += 1; break }
          if (k.length >= 4 && tok.length >= 4 && lev(tok, k) <= 1) { score += 1; break }
        }
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { id: topic.id, score }
  }
  return best ? best.id : null
}

// ---- real-account answer formatters ---------------------------------------
export type AccountSummary = {
  planName: string | null
  balance: number
  dueLabel: string | null
  disconnect: boolean
}

function peso(n: number): string {
  return '₱' + Math.round(n).toLocaleString('en-PH')
}

export function formatBillAnswer(a: AccountSummary): string {
  if (a.balance <= 0) {
    return 'Good news — you have no outstanding balance right now. Your bills and payment history are in the Payment tab.'
  }
  const due = a.dueLabel ? ` due ${a.dueLabel}` : ''
  const warn = a.disconnect
    ? ' Your line is flagged for disconnection, so please settle it as soon as you can.'
    : ''
  return `Your current balance is ${peso(a.balance)}${due}.${warn} Open Payment to pay and upload your proof.`
}

export function formatPlanAnswer(a: AccountSummary): string {
  if (!a.planName) {
    return 'You don’t have a plan set yet. Open Payment to choose one — it shows the current prices and the one-time installation fee.'
  }
  const bal = a.balance > 0 ? ` You currently owe ${peso(a.balance)}.` : ''
  return `You’re on the ${a.planName} plan.${bal} Open Payment to see its current price, your bills, or to switch plans.`
}
