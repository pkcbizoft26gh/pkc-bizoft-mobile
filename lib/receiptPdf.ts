import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { File, Paths } from 'expo-file-system'

// Turns a payment receipt into a PDF the customer can save or send. The HTML is
// plain and self-contained (no remote images or fonts) so it prints the same on
// every phone. Everything that comes from the database is escaped first.

export type ReceiptData = {
  receipt_number: string | null
  amount: number | null
  method: string | null
  payment_date: string | null
  customer_name: string | null
  account_id: string | null
  plan: string | null
  kind?: 'bill' | 'plan' | null
  reference?: string | null
  bill_id?: string | null
  period_start?: string | null
  period_end?: string | null
}

export function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function peso(value: number | null | undefined) {
  return `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function day(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function receiptFileName(receipt: ReceiptData) {
  const base = (receipt.receipt_number || 'receipt').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40)
  return `PKC-BIZOFT-${base}`
}

export function buildReceiptHtml(receipt: ReceiptData) {
  const forBill = receipt.kind === 'bill' && !!receipt.bill_id
  const rows: [string, string][] = [
    ['Receipt no.', receipt.receipt_number || '-'],
    ['Customer', receipt.customer_name || '-'],
    ['Account ID', receipt.account_id || '-'],
    forBill ? ['Bill', receipt.bill_id as string] : ['Plan', receipt.plan || '-'],
  ]
  if (forBill && receipt.period_start && receipt.period_end) {
    rows.push(['Billing period', `${day(receipt.period_start)} - ${day(receipt.period_end)}`])
  }
  rows.push(['Payment method', receipt.method || '-'])
  if (receipt.reference) rows.push(['Reference no.', receipt.reference])
  rows.push(['Payment date', day(receipt.payment_date)])

  const body = rows
    .map(([label, value]) => `<tr><td class="l">${escapeHtml(label)}</td><td class="v">${escapeHtml(value)}</td></tr>`)
    .join('')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: Helvetica, Arial, sans-serif; color: #0b1422; margin: 0; padding: 40px; }
  .brand { font-size: 14px; letter-spacing: 3px; font-weight: 700; color: #0086a0; }
  h1 { font-size: 26px; margin: 6px 0 2px; }
  .sub { color: #5b6b7b; font-size: 13px; margin-bottom: 26px; }
  .amount { font-size: 38px; font-weight: 800; margin: 8px 0 22px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 11px 0; border-bottom: 1px solid #dde5ec; font-size: 14px; }
  td.l { color: #5b6b7b; width: 42%; }
  td.v { font-weight: 700; text-align: right; }
  .paid { display: inline-block; margin-top: 26px; padding: 6px 14px; border: 2px solid #1b9c70; color: #1b9c70; font-weight: 800; border-radius: 6px; letter-spacing: 2px; }
  .foot { margin-top: 36px; color: #8a97a4; font-size: 11px; }
</style>
</head>
<body>
  <div class="brand">PKC BIZOFT</div>
  <h1>Payment receipt</h1>
  <div class="sub">Thank you for your payment.</div>
  <div class="amount">${escapeHtml(peso(receipt.amount))}</div>
  <table>${body}</table>
  <div class="paid">PAID</div>
  <div class="foot">This receipt was issued electronically by PKC BIZOFT and is valid without a signature.</div>
</body>
</html>`
}

/** Creates the PDF and opens the phone's share sheet (save to files, send in chat, print). */
export async function shareReceiptPdf(receipt: ReceiptData) {
  const { uri: generated } = await Print.printToFileAsync({ html: buildReceiptHtml(receipt), width: 595, height: 842 })
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this phone.')
  }

  // The print engine names the file with a random id; give it the receipt number
  // so the person who receives it knows what it is.
  let uri = generated
  try {
    const named = new File(Paths.cache, `${receiptFileName(receipt)}.pdf`)
    if (named.exists) named.delete()
    new File(generated).move(named)
    uri = named.uri
  } catch (error) {
    // Keep the generated file if renaming is not possible.
    console.warn('Could not rename the receipt PDF:', (error as Error)?.message)
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    dialogTitle: receiptFileName(receipt),
    UTI: 'com.adobe.pdf',
  })
}
