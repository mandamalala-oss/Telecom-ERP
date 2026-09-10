import { describe, it, expect } from 'vitest'
import { milestoneAmount, milestoneDueDate, buildMilestoneRows, pendingMilestoneForTrigger, invoiceFromMilestone } from './paymentSchedule'
import type { PaymentSchedule, ProjectPaymentMilestone } from '@/types/v2'

const schedule: PaymentSchedule = {
  id: 's1',
  name: '20/65/15 — Advance / PAC / FAC',
  milestones: [
    { id: 'adv', name: 'Advance', pct: 20, trigger: 'advance', dueDays: 0 },
    { id: 'pac', name: 'After PAC', pct: 65, trigger: 'PAC', dueDays: 0 },
    { id: 'fac', name: 'After FAC', pct: 15, trigger: 'FAC', dueDays: 30 },
  ],
  isActive: true,
  createdAt: '2026-01-01',
}

const project = { id: 'p1', name: 'Site A build', revenue: 10_000_000, startDate: '2026-03-01' }

describe('milestoneAmount', () => {
  it('is pct% of revenue, rounded to a whole unit', () => {
    expect(milestoneAmount(10_000_000, 20)).toBe(2_000_000)
    expect(milestoneAmount(10_000_000, 65)).toBe(6_500_000)
    expect(milestoneAmount(1_000_001, 15)).toBe(150_000) // 150000.15 → rounded
  })

  it('treats missing/invalid inputs as zero', () => {
    expect(milestoneAmount(0, 20)).toBe(0)
    expect(milestoneAmount(NaN as unknown as number, 20)).toBe(0)
    expect(milestoneAmount(1000, NaN as unknown as number)).toBe(0)
  })
})

describe('milestoneDueDate', () => {
  it('adds the offset to the base date', () => {
    expect(milestoneDueDate('2026-03-01', 0)).toBe('2026-03-01')
    expect(milestoneDueDate('2026-03-01', 90)).toBe('2026-05-30')
  })

  it('is undefined without a base date (never an empty date string)', () => {
    expect(milestoneDueDate(undefined, 30)).toBeUndefined()
    expect(milestoneDueDate('', 30)).toBeUndefined()
  })
})

describe('buildMilestoneRows', () => {
  it('expands the schedule with amounts from project revenue', () => {
    const rows = buildMilestoneRows(schedule, project)
    expect(rows.map((r) => r.name)).toEqual(['Advance', 'After PAC', 'After FAC'])
    expect(rows.map((r) => r.amount)).toEqual([2_000_000, 6_500_000, 1_500_000])
    expect(rows.every((r) => r.status === 'pending')).toBe(true)
    expect(rows[0]).toMatchObject({ projectId: 'p1', scheduleName: schedule.name, trigger: 'advance', dueDate: '2026-03-01' })
    // FAC carries its 30-day offset from the project start date.
    expect(rows[2].dueDate).toBe('2026-03-31')
  })

  it('leaves dueDate unset when the project has no start date', () => {
    const rows = buildMilestoneRows(schedule, { ...project, startDate: '' })
    expect(rows.every((r) => r.dueDate === undefined)).toBe(true)
  })
})

describe('pendingMilestoneForTrigger', () => {
  const base = { id: 'm', projectId: 'p1', name: 'x', pct: 20, trigger: 'PAC', dueDays: 0, amount: 1, status: 'pending', createdAt: '' } as ProjectPaymentMilestone

  it('returns the first pending milestone for a trigger', () => {
    expect(pendingMilestoneForTrigger([base], 'PAC')?.id).toBe('m')
  })

  it('ignores already-invoiced or paid milestones and other triggers', () => {
    expect(pendingMilestoneForTrigger([{ ...base, status: 'invoiced' }], 'PAC')).toBeUndefined()
    expect(pendingMilestoneForTrigger([{ ...base, status: 'paid' }], 'PAC')).toBeUndefined()
    expect(pendingMilestoneForTrigger([base], 'FAC')).toBeUndefined()
  })
})

describe('invoiceFromMilestone', () => {
  const milestone = { id: 'm1', name: 'After PAC', pct: 65, amount: 6_500_000 }

  it('builds a single-line, untaxed draft invoice for the milestone', () => {
    const inv = invoiceFromMilestone(milestone, { id: 'p1', name: 'Site A', customerId: 'c1', customerName: 'ACME', projectType: 'telecom_service' }, 'INV-2026-001', '2026-06-01', '2026-06-01')
    expect(inv.number).toBe('INV-2026-001')
    expect(inv.status).toBe('draft')
    expect(inv.deliveryType).toBe('ASP')
    expect(inv.total).toBe(6_500_000)
    expect(inv.paid).toBe(0)
    expect(inv.items).toHaveLength(1)
    expect(inv.items[0]).toMatchObject({ quantity: 1, unitPrice: 6_500_000, total: 6_500_000 })
    expect(inv.items[0].description).toContain('After PAC')
    expect(inv.items[0].description).toContain('65%')
  })

  it('marks a supply/trading project invoice as SUPPLY', () => {
    const inv = invoiceFromMilestone(milestone, { id: 'p1', name: 'Goods', customerId: 'c1', customerName: 'ACME', projectType: 'supply_trading' }, 'INV-1', '2026-06-01', '2026-06-01')
    expect(inv.deliveryType).toBe('SUPPLY')
  })
})
