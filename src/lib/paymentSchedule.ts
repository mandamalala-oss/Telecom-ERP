import type { Project, Invoice } from '@/types'
import type { PaymentSchedule, ProjectPaymentMilestone, MilestoneTrigger } from '@/types/v2'
import { addDays } from './financeWorkflows'

// Milestone billing: a schedule template (percent of project revenue) expands
// into per-project milestone rows. These helpers are pure so the billing math
// and the invoice payload are unit-testable without Supabase.

export const MILESTONE_TRIGGERS: MilestoneTrigger[] = ['advance', 'PAC', 'FAC', 'manual']

/** Milestone amount = pct% of the project revenue (the 100% base), rounded to
 * a whole currency unit (amount is a bigint column). */
export function milestoneAmount(revenue: number, pct: number): number {
  return Math.round(((Number(revenue) || 0) * (Number(pct) || 0)) / 100)
}

/** Due date = trigger base date + the milestone's due-day offset. Undefined
 * when there is no base date (a date column rejects ''). */
export function milestoneDueDate(baseDate: string | undefined, dueDays: number): string | undefined {
  if (!baseDate) return undefined
  return addDays(baseDate, Number(dueDays) || 0)
}

/** Expand a schedule into milestone ledger rows for a project. */
export function buildMilestoneRows(
  schedule: Pick<PaymentSchedule, 'id' | 'name' | 'milestones'>,
  project: Pick<Project, 'id' | 'name' | 'revenue' | 'startDate'>
): Array<Partial<ProjectPaymentMilestone>> {
  return (schedule.milestones ?? []).map((m) => ({
    projectId: project.id,
    projectName: project.name,
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    name: m.name,
    pct: m.pct,
    trigger: m.trigger,
    dueDays: Number(m.dueDays) || 0,
    amount: milestoneAmount(project.revenue, m.pct),
    status: 'pending',
    dueDate: milestoneDueDate(project.startDate, m.dueDays),
  }))
}

/** First still-pending milestone for a trigger — what a PAC/FAC signing bills. */
export function pendingMilestoneForTrigger(
  rows: ProjectPaymentMilestone[],
  trigger: MilestoneTrigger
): ProjectPaymentMilestone | undefined {
  return rows.find((r) => r.trigger === trigger && r.status === 'pending')
}

/** A draft invoice for one milestone (single line, untaxed by default). */
export function invoiceFromMilestone(
  milestone: Pick<ProjectPaymentMilestone, 'id' | 'name' | 'pct' | 'amount'>,
  project: Pick<Project, 'id' | 'name' | 'customerId' | 'customerName' | 'projectType'>,
  number: string,
  issueDate: string,
  dueDate: string
): Omit<Invoice, 'id' | 'balance'> {
  const amount = Number(milestone.amount) || 0
  return {
    number,
    customerId: project.customerId,
    customerName: project.customerName,
    projectId: project.id,
    deliveryType: project.projectType === 'supply_trading' ? 'SUPPLY' : 'ASP',
    status: 'draft',
    items: [{
      id: `${milestone.id}-1`,
      description: `${milestone.name} (${milestone.pct}%) — ${project.name}`,
      quantity: 1,
      unit: 'lot',
      unitPrice: amount,
      total: amount,
    }],
    subtotal: amount,
    taxRate: 0,
    tax: 0,
    total: amount,
    paid: 0,
    issueDate,
    dueDate,
    notes: `Auto-created from payment milestone "${milestone.name}"`,
  }
}
