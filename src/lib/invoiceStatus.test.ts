import { describe, expect, it } from 'vitest'
import { resolvePaidOnStatusChange } from '@/lib/invoiceStatus'

describe('resolvePaidOnStatusChange', () => {
  it('settles the invoice in full when marked paid', () => {
    expect(resolvePaidOnStatusChange('paid', 1_000_000, 400_000)).toBe(1_000_000)
    expect(resolvePaidOnStatusChange('paid', 500_000, 0)).toBe(500_000)
  })

  it('restores recorded payments when leaving the paid status (balance returns)', () => {
    expect(resolvePaidOnStatusChange('sent', 1_000_000, 400_000)).toBe(400_000)
    expect(resolvePaidOnStatusChange('draft', 1_000_000, 0)).toBe(0)
    expect(resolvePaidOnStatusChange('overdue', 1_000_000, 250_000)).toBe(250_000)
    expect(resolvePaidOnStatusChange('cancelled', 1_000_000, 0)).toBe(0)
  })
})
