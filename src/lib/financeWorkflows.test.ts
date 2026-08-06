// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { autoPaymentForPaid, poFromAcceptedQuote, invoiceFromReceivedPo, remainingOnInvoice, isAutoPayment, nextNumberFor, hasAutoDoc } from './financeWorkflows'

const invoice = { id: 'inv1', number: 'INV-001', customerName: 'ACME', total: 1000 }

const quote = {
  number: 'QT-001',
  customerId: 'c1',
  customerName: 'ACME',
  projectId: 'p1',
  items: [{ id: 'i1', description: 'Cable', quantity: 2, unit: 'm', unitPrice: 500, total: 1000 }],
  subtotal: 1000,
  tax: 50,
  total: 1050,
}

const po = {
  number: 'PO-001',
  vendorId: 'v1',
  vendorName: 'VendorCo',
  projectId: 'p1',
  items: [{ id: 'i1', description: 'Tower', quantity: 1, unit: 'u', unitPrice: 9000, total: 9000 }],
  subtotal: 9000,
  tax: 0,
  total: 9000,
}

describe('financeWorkflows — invoice marked paid', () => {
  it('creates a full payment when nothing was recorded yet', () => {
    const pay = autoPaymentForPaid(invoice, 0, '2026-08-05')
    expect(pay).not.toBeNull()
    expect(pay!.amount).toBe(1000)
    expect(pay!.invoiceId).toBe('inv1')
    expect(pay!.invoiceNumber).toBe('INV-001')
    expect(pay!.method).toBe('bank_transfer')
    expect(pay!.reference).toContain('INV-001')
  })

  it('creates a payment for only the remaining balance after partial payments', () => {
    const pay = autoPaymentForPaid(invoice, 400, '2026-08-05')
    expect(pay!.amount).toBe(600)
  })

  it('returns null when the invoice is already fully paid', () => {
    expect(autoPaymentForPaid(invoice, 1000, '2026-08-05')).toBeNull()
    expect(remainingOnInvoice(invoice, 1000)).toBe(0)
  })

  it('never creates a negative payment', () => {
    expect(autoPaymentForPaid(invoice, 1500, '2026-08-05')).toBeNull()
  })
})

describe('financeWorkflows — accepted quote → PO', () => {
  it('creates a PO with status sent and the quote customer as vendor', () => {
    const out = poFromAcceptedQuote(quote, 'PO-2026-0001', '2026-08-05')
    expect(out.status).toBe('sent')
    expect(out.vendorId).toBe('c1')
    expect(out.vendorName).toBe('ACME')
    expect(out.total).toBe(1050)
    expect(out.items).toHaveLength(1)
    expect(out.items[0].description).toBe('Cable')
    expect(out.number).toBe('PO-2026-0001')
    expect(out.notes).toContain('QT-001')
  })
})

describe('financeWorkflows — received PO → invoice', () => {
  it('creates a draft invoice with the PO vendor as customer and paid 0', () => {
    const out = invoiceFromReceivedPo(po, 'INV-2026-0001', '2026-08-05', '2026-09-04')
    expect(out.status).toBe('draft')
    expect(out.customerId).toBe('v1')
    expect(out.customerName).toBe('VendorCo')
    expect(out.total).toBe(9000)
    expect(out.paid).toBe(0)
    expect(out.issueDate).toBe('2026-08-05')
    expect(out.dueDate).toBe('2026-09-04')
    expect(out.taxRate).toBe(0)
    expect(out.notes).toContain('PO-001')
  })

  it('back-derives the tax rate from the PO tax amount', () => {
    const out = invoiceFromReceivedPo({ ...po, subtotal: 8000, tax: 800 }, 'INV-1', '2026-08-05', '2026-09-04')
    expect(out.taxRate).toBe(10)
    expect(out.tax).toBe(800)
  })
})

describe('financeWorkflows — helpers', () => {
  it('isAutoPayment detects the auto settlement tag', () => {
    expect(isAutoPayment({ reference: 'Auto — settled INV-001' })).toBe(true)
    expect(isAutoPayment({ reference: 'Customer paid cash' })).toBe(false)
    expect(isAutoPayment({ reference: '' })).toBe(false)
  })

  it('nextNumberFor continues after the highest existing number for the day', () => {
    const existing = [
      { number: 'PO-20260805-01' },
      { number: 'PO-20260805-03' }, // 02 was deleted
      { number: 'PO-20260804-99' }, // different day, ignored
    ]
    expect(nextNumberFor('PO', existing, '2026-08-05')).toBe('PO-20260805-04')
    expect(nextNumberFor('INV', [], '2026-08-05')).toBe('INV-20260805-01')
  })

  it('hasAutoDoc finds auto-created docs by the source number in their notes', () => {
    const pos = [{ notes: 'Auto-created from accepted quote QT-001' }, { notes: 'Manual PO' }]
    expect(hasAutoDoc(pos, 'QT-001')).toBe(true)
    expect(hasAutoDoc(pos, 'QT-999')).toBe(false)
    expect(hasAutoDoc([], 'QT-001')).toBe(false)
  })
})
