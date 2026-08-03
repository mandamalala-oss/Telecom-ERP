/**
 * How `invoices.paid` should read after a quick status change from the
 * table dropdown:
 * - status "paid"      → settle the invoice in full: paid = total (balance 0)
 * - any other status   → restore paid to what was actually recorded as
 *                        payments, so an accidental "paid" click can be
 *                        reverted and the balance comes back.
 */
export function resolvePaidOnStatusChange(status: string, total: number, recordedPayments: number): number {
  return status === 'paid' ? total : recordedPayments
}
