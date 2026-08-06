import type { Quote, Invoice, PurchaseOrder, Payment } from '@/types'

// Finance workflow automation: pure builders used by FinanceModule when the
// user changes a status inline. Each returns the row to INSERT (or null when
// nothing should be created) — kept pure so the rules are unit-testable.

/** Auto-generated payments are tagged with this reference prefix, so they can
 * be told apart from manual payments (e.g. when an invoice leaves 'paid'). */
export const AUTO_PAYMENT_PREFIX = 'Auto —'

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
  inv: Pick<Invoice, 'id' | 'number' | 'customerName' | 'total'>,
  recordedPayments: number,
  date: string
): Omit<Payment, 'id'> | null {
  const amount = remainingOnInvoice(inv, recordedPayments)
  if (amount <= 0) return null
  return {
    invoiceId: inv.id,
    invoiceNumber: inv.number,
    customerName: inv.customerName,
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
  q: Pick<Quote, 'number' | 'customerId' | 'customerName' | 'projectId' | 'items' | 'subtotal' | 'tax' | 'total'>,
  number: string,
  orderDate: string
): Omit<PurchaseOrder, 'id' | 'expectedDelivery'> {
  return {
    number,
    vendorId: q.customerId,
    vendorName: q.customerName,
    projectId: q.projectId,
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
  po: Pick<PurchaseOrder, 'number' | 'vendorId' | 'vendorName' | 'projectId' | 'items' | 'subtotal' | 'tax' | 'total'>,
  number: string,
  issueDate: string,
  dueDate: string
): Omit<Invoice, 'id' | 'balance'> {
  return {
    number,
    customerId: po.vendorId,
    customerName: po.vendorName,
    projectId: po.projectId,
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
