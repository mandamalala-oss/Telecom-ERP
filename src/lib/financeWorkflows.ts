import type { Quote, Invoice, PurchaseOrder, Payment, SupplyItem, Project, Region } from '@/types'

// Finance workflow automation: pure builders used by FinanceModule when the
// user changes a status inline. Each returns the row to INSERT (or null when
// nothing should be created) — kept pure so the rules are unit-testable.

/** Auto-generated payments are tagged with this reference prefix, so they can
 * be told apart from manual payments (e.g. when an invoice leaves 'paid'). */
export const AUTO_PAYMENT_PREFIX = 'Auto —'

/** True when a received PO carries a delivery type — the auto-project trigger
 * condition. Fires on PO status = received for BOTH delivery types (the
 * builder picks the project business line): SUPPLY → supply/trading,
 * ASP → telecom_service. Evaluated on the full record so it fires regardless
 * of which field changed last. */
export function shouldAutoCreateProject(po: Pick<PurchaseOrder, 'deliveryType' | 'status'>): boolean {
  return po.status === 'received' && (po.deliveryType === 'SUPPLY' || po.deliveryType === 'ASP')
}

/** YYYY-MM-DD + N calendar days (local-time, DST-safe, no UTC drift). */
export function addDays(dateStr: string, days: number): string {
  if (!dateStr) return dateStr
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return dateStr
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/**
 * Quotes linked to a PO: the explicit quote_id (set by the quote-accepted
 * automation) plus any quote whose number appears in the PO notes (the
 * pre-quote_id convention, e.g. "Auto-created from accepted quote QT-001").
 * Matches on non-alphanumeric boundaries so QT-001 never matches QT-0012.
 */
export function quotesLinkedToPo(po: Pick<PurchaseOrder, 'quoteId' | 'notes'>, quotes: Array<Pick<Quote, 'id' | 'number' | 'items'>>): Array<Pick<Quote, 'id' | 'number' | 'items'>> {
  const notes = po.notes ?? ''
  return quotes.filter((q) => {
    if (po.quoteId && q.id === po.quoteId) return true
    const esc = q.number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|$)`).test(notes)
  })
}

/**
 * Received PO → the Project to auto-create (payload for
 * insert_project_with_goods) + its goods lines, or null when the trigger
 * condition isn't met.
 *
 * SUPPLY → a supply/trading project, mapped per auto-project.md: customer
 * from the PO (its vendor IS the client in this ERP), PO reference, start =
 * received date, end = +30d, delivery deadline = +15d, delivery status
 * pending, goods lines from every Quote linked to the PO (quote_id or notes;
 * a PO with no linked Quote still yields a Project, just without goods
 * lines). purchase_price is left 0 (manual, like the SupplyProjectModal
 * "From Quote" pre-fill), so budget/spent = 0 and revenue = total selling.
 *
 * ASP → a telecom_service project (no goods lines, no delivery fields): same
 * customer/PO reference/dates, revenue = the PO total.
 */
export function projectFromReceivedPo(
  po: Pick<PurchaseOrder, 'number' | 'vendorId' | 'vendorName' | 'quoteId' | 'notes' | 'deliveryType' | 'status' | 'total'>,
  quotes: Array<Pick<Quote, 'id' | 'number' | 'items'>>,
  receivedDate: string
): { project: Partial<Project>; goodsLines: SupplyItem[] } | null {
  if (!shouldAutoCreateProject(po)) return null

  let sellingTotal = 0
  const goodsLines: SupplyItem[] = []
  if (po.deliveryType === 'SUPPLY') {
    for (const q of quotesLinkedToPo(po, quotes)) {
      for (const it of q.items ?? []) {
        const qty = Number(it.quantity) || 0
        const selling = Number(it.unitPrice) || 0
        sellingTotal += qty * selling
        goodsLines.push({
          code: String(goodsLines.length + 1),
          description: String(it.description ?? '').trim(),
          unit: String(it.unit ?? '').trim() || 'U',
          qty,
          purchasePrice: 0,
          sellingPrice: selling,
        })
      }
    }
  }

  const project: Partial<Project> = {
    // In this ERP the PO's vendor IS the client (quote.customer → po.vendor),
    // so the auto project inherits its customer from the source record.
    name: po.number,
    customerId: po.vendorId,
    customerName: po.vendorName,
    status: 'not_started',
    currentPhase: 'survey',
    phases: [],
    progress: 0,
    region: '' as Region,
    poReference: po.number,
    notes: `Auto-created from PO ${po.number}`,
    budget: 0,
    spent: 0,
  }
  if (po.deliveryType === 'SUPPLY') {
    project.projectType = 'supply_trading'
    project.customerContact = '' // no contact recorded on POs/Quotes — left blank
    project.deliveryStatus = 'pending'
    project.revenue = Math.round(sellingTotal)
  } else {
    project.projectType = 'telecom_service'
    project.revenue = Math.round(po.total ?? 0)
  }
  // Date columns reject '' — only set when a real received date exists.
  if (receivedDate) {
    project.startDate = receivedDate
    project.endDate = addDays(receivedDate, 30)
    if (po.deliveryType === 'SUPPLY') project.deliveryDeadline = addDays(receivedDate, 15)
  }
  return { project, goodsLines }
}

export function isAutoPayment(p: Pick<Payment, 'reference'>): boolean {
  return (p.reference ?? '').startsWith(AUTO_PAYMENT_PREFIX)
}

/** Next sequential number under a daily prefix, avoiding collisions with any
 * existing row (works after mid-list deletions too). e.g. PO-20260805-03. */
export function nextNumberFor(
  prefix: string,
  existing: Array<{ number?: string }>,
  dateStr: string
): string {
  const day = dateStr.replace(/-/g, '')
  const head = `${prefix}-${day}-`
  const max = existing.reduce((m, x) => {
    const num = x.number ?? ''
    // Only today's prefix counts — a different day's number must not be sliced.
    const n = num.startsWith(head) ? parseInt(num.slice(head.length), 10) : NaN
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `${head}${String(max + 1).padStart(2, '0')}`
}

/** True when an auto-created doc for `sourceNumber` already exists — auto docs
 * carry the source number in their notes, so toggling a status back and forth
 * (e.g. accepted → rejected → accepted) cannot create duplicates. */
export function hasAutoDoc(existing: Array<{ notes?: string }>, sourceNumber: string): boolean {
  return existing.some((x) => (x.notes ?? '').includes(sourceNumber))
}

/** Remaining amount to settle an invoice, given its already-recorded payments. */
export function remainingOnInvoice(inv: Pick<Invoice, 'total'>, recordedPayments: number): number {
  return Math.max(0, (inv.total ?? 0) - (recordedPayments ?? 0))
}

/**
 * Invoice marked "paid" → auto-create a Payment for whatever is still unpaid
 * (so payments + paid always reconcile to total). Null when nothing is due.
 */
export function autoPaymentForPaid(
  inv: Pick<Invoice, 'id' | 'number' | 'customerName' | 'total' | 'deliveryType'>,
  recordedPayments: number,
  date: string
): Omit<Payment, 'id'> | null {
  const amount = remainingOnInvoice(inv, recordedPayments)
  if (amount <= 0) return null
  return {
    invoiceId: inv.id,
    invoiceNumber: inv.number,
    customerName: inv.customerName,
    deliveryType: inv.deliveryType,
    amount,
    date,
    method: 'bank_transfer',
    reference: `Auto — settled ${inv.number}`,
    notes: 'Auto-created when the invoice was marked paid',
  }
}

/**
 * Quote accepted → auto-create a Purchase Order (default status 'sent').
 * The quote's customer maps onto the PO's vendor. `orderDate` is the date the
 * status was selected; expected_delivery is left NULL (never an empty string —
 * Postgres rejects '' for a date column).
 */
export function poFromAcceptedQuote(
  q: Pick<Quote, 'id' | 'number' | 'customerId' | 'customerName' | 'projectId' | 'items' | 'subtotal' | 'tax' | 'total' | 'deliveryType'>,
  number: string,
  orderDate: string
): Omit<PurchaseOrder, 'id' | 'expectedDelivery'> {
  return {
    number,
    vendorId: q.customerId,
    vendorName: q.customerName,
    projectId: q.projectId,
    quoteId: q.id,
    deliveryType: q.deliveryType,
    status: 'sent',
    items: (q.items ?? []).map((i) => ({ ...i })),
    subtotal: q.subtotal ?? 0,
    tax: q.tax ?? 0,
    total: q.total ?? 0,
    orderDate,
    notes: `Auto-created from accepted quote ${q.number}`,
  }
}

/**
 * PO received → auto-create an Invoice (default status 'draft').
 * The PO's vendor maps onto the invoice's customer.
 */
export function invoiceFromReceivedPo(
  po: Pick<PurchaseOrder, 'number' | 'vendorId' | 'vendorName' | 'projectId' | 'items' | 'subtotal' | 'tax' | 'total' | 'deliveryType'>,
  number: string,
  issueDate: string,
  dueDate: string
): Omit<Invoice, 'id' | 'balance'> {
  return {
    number,
    customerId: po.vendorId,
    customerName: po.vendorName,
    projectId: po.projectId,
    deliveryType: po.deliveryType,
    status: 'draft',
    items: (po.items ?? []).map((i) => ({ ...i })),
    subtotal: po.subtotal ?? 0,
    // PO has no rate field, only a tax amount — back-derive the % so the
    // invoice's "Tax (x%)" display matches its tax amount.
    taxRate: (po.subtotal ?? 0) > 0 ? Math.round(((po.tax ?? 0) / (po.subtotal ?? 0)) * 100) : 0,
    tax: po.tax ?? 0,
    total: po.total ?? 0,
    paid: 0,
    issueDate,
    dueDate,
    notes: `Auto-created from received PO ${po.number}`,
  }
}
