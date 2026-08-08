// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { autoPaymentForPaid, poFromAcceptedQuote, invoiceFromReceivedPo, remainingOnInvoice, isAutoPayment, nextNumberFor, hasAutoDoc, addDays, quotesLinkedToPo, projectFromReceivedPo } from './financeWorkflows'

const invoice = { id: 'inv1', number: 'INV-001', customerName: 'ACME', total: 1000, deliveryType: 'SUPPLY' as const }

const quote = {
  id: 'q1',
  number: 'QT-001',
  customerId: 'c1',
  customerName: 'ACME',
  projectId: 'p1',
  deliveryType: 'SUPPLY' as const,
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
  deliveryType: 'SUPPLY' as const,
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
    expect(pay!.deliveryType).toBe('SUPPLY')
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
  it('creates a PO with status sent, order date = selection date, and no empty-string dates', () => {
    const out = poFromAcceptedQuote(quote, 'PO-2026-0001', '2026-08-05')
    expect(out.status).toBe('sent')
    expect(out.vendorId).toBe('c1')
    expect(out.vendorName).toBe('ACME')
    expect(out.total).toBe(1050)
    expect(out.items).toHaveLength(1)
    expect(out.items[0].description).toBe('Cable')
    expect(out.number).toBe('PO-2026-0001')
    expect(out.orderDate).toBe('2026-08-05')
    expect(out.quoteId).toBe('q1')
    expect(out.deliveryType).toBe('SUPPLY')
    expect(out.notes).toContain('QT-001')
    // expected_delivery must be omitted, not an empty string (date column).
    expect('expectedDelivery' in out).toBe(false)
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
    expect(out.deliveryType).toBe('SUPPLY')
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

describe('financeWorkflows — addDays', () => {
  it('adds calendar days across month boundaries', () => {
    expect(addDays('2026-08-05', 30)).toBe('2026-09-04')
    expect(addDays('2026-08-05', 15)).toBe('2026-08-20')
    expect(addDays('2026-12-20', 15)).toBe('2027-01-04')
  })

  it('is a no-op on empty input', () => {
    expect(addDays('', 30)).toBe('')
  })
})

describe('financeWorkflows — quotesLinkedToPo', () => {
  const qa = { ...quote, id: 'qa', number: 'QT-001' }
  const qb = { ...quote, id: 'qb', number: 'QT-002', items: [{ id: 'i2', description: 'Router', quantity: 1, unit: 'u', unitPrice: 900, total: 900 }] }

  it('matches by explicit quote_id first', () => {
    expect(quotesLinkedToPo({ quoteId: 'qb', notes: '' }, [qa, qb]).map(q => q.id)).toEqual(['qb'])
  })

  it('falls back to the quote number mentioned in the PO notes', () => {
    const po = { quoteId: undefined, notes: 'Auto-created from accepted quote QT-001' }
    expect(quotesLinkedToPo(po, [qa, qb]).map(q => q.id)).toEqual(['qa'])
  })

  it('does not match a shorter number inside a longer one (QT-001 vs QT-0012)', () => {
    const po = { quoteId: undefined, notes: 'Auto-created from accepted quote QT-0012' }
    expect(quotesLinkedToPo(po, [qa, qb])).toEqual([])
  })

  it('returns nothing for a PO with no linked quote', () => {
    expect(quotesLinkedToPo({ quoteId: undefined, notes: 'Manual PO' }, [qa, qb])).toEqual([])
  })
})

describe('financeWorkflows — received PO → auto Project (SUPPLY vs ASP)', () => {
  const supplyPo = {
    number: 'PO-2026-0001',
    vendorId: 'c1',
    vendorName: 'ACME',
    quoteId: 'q1',
    notes: 'Auto-created from accepted quote QT-001',
    deliveryType: 'SUPPLY' as const,
    status: 'received' as const,
    total: 1050,
  }

  it('SUPPLY + received → a correctly-mapped supply/trading project', () => {
    const out = projectFromReceivedPo(supplyPo, [quote], '2026-08-05')
    expect(out).not.toBeNull()
    const { project, goodsLines } = out!
    // Customer comes from the source PO (whose vendor IS the client here).
    expect(project.customerId).toBe('c1')
    expect(project.customerName).toBe('ACME')
    expect(project.poReference).toBe('PO-2026-0001')
    expect(project.name).toBe('PO-2026-0001')
    // Dates: received date, +30d end, +15d delivery.
    expect(project.startDate).toBe('2026-08-05')
    expect(project.endDate).toBe('2026-09-04')
    expect(project.deliveryDeadline).toBe('2026-08-20')
    expect(project.deliveryStatus).toBe('pending')
    expect(project.projectType).toBe('supply_trading')
    expect(project.status).toBe('not_started')
    // Supply convention: BAC/AC = purchase cost (0 here — purchase is manual),
    // PO/revenue = total selling (2 × 500).
    expect(project.budget).toBe(0)
    expect(project.spent).toBe(0)
    expect(project.revenue).toBe(1000)
    // Goods lines: one per quote line, mapped from the quote's line items.
    expect(goodsLines).toHaveLength(1)
    expect(goodsLines[0].description).toBe('Cable')
    expect(goodsLines[0].unit).toBe('m')
    expect(goodsLines[0].qty).toBe(2)
    expect(goodsLines[0].sellingPrice).toBe(500)
    expect(goodsLines[0].purchasePrice).toBe(0)
    expect(goodsLines[0].code).toBe('1')
  })

  it('ASP + received → a telecom_service project with no goods lines', () => {
    const out = projectFromReceivedPo({ ...supplyPo, deliveryType: 'ASP', total: 9000 }, [quote], '2026-08-05')
    expect(out).not.toBeNull()
    const { project, goodsLines } = out!
    expect(project.projectType).toBe('telecom_service')
    expect(project.customerId).toBe('c1')
    expect(project.poReference).toBe('PO-2026-0001')
    expect(project.startDate).toBe('2026-08-05')
    expect(project.endDate).toBe('2026-09-04')
    expect(project.revenue).toBe(9000) // PO total, not quote selling
    expect(project.deliveryStatus).toBeUndefined()
    expect(goodsLines).toEqual([])
  })

  it('received PO with NO delivery type never creates a project', () => {
    expect(projectFromReceivedPo({ ...supplyPo, deliveryType: undefined }, [quote], '2026-08-05')).toBeNull()
  })

  it('SUPPLY but NOT received never creates a project', () => {
    expect(projectFromReceivedPo({ ...supplyPo, status: 'sent' }, [quote], '2026-08-05')).toBeNull()
    expect(projectFromReceivedPo({ ...supplyPo, status: 'accepted' }, [quote], '2026-08-05')).toBeNull()
  })

  it('pulls goods lines from every quote linked to the PO', () => {
    const q2 = { ...quote, id: 'q2', number: 'QT-002', items: [{ id: 'i2', description: 'Router', quantity: 1, unit: 'u', unitPrice: 900, total: 900 }] }
    const out = projectFromReceivedPo({ ...supplyPo, quoteId: undefined, notes: 'Auto-created from accepted quote QT-001 and QT-002' }, [quote, q2], '2026-08-05')
    expect(out!.goodsLines).toHaveLength(2)
    expect(out!.project.revenue).toBe(1900)
    expect(out!.goodsLines[1].code).toBe('2')
  })

  it('still creates the SUPPLY project when no quote is linked — without goods lines', () => {
    const out = projectFromReceivedPo({ ...supplyPo, quoteId: undefined, notes: 'Manual PO' }, [quote], '2026-08-05')
    expect(out).not.toBeNull()
    expect(out!.goodsLines).toEqual([])
    expect(out!.project.revenue).toBe(0)
  })

  it('omits date fields entirely when no received date is available', () => {
    const out = projectFromReceivedPo(supplyPo, [quote], '')
    expect(out!.project.startDate).toBeUndefined()
    expect(out!.project.endDate).toBeUndefined()
    expect(out!.project.deliveryDeadline).toBeUndefined()
  })
})
