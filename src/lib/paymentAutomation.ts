import { makeApi } from './api/crud'
import { nextNumberFor, addDays } from './financeWorkflows'
import { buildMilestoneRows, pendingMilestoneForTrigger, invoiceFromMilestone } from './paymentSchedule'
import type { Project, Invoice } from '@/types'
import type { AcceptanceCertificate, PaymentSchedule, ProjectPaymentMilestone, MilestoneStatus } from '@/types/v2'

// Side-effectful milestone billing orchestration. Kept out of the pure
// paymentSchedule.ts helpers so the rules stay unit-testable.

const schedulesApi  = () => makeApi<PaymentSchedule>('payment_schedules')
const milestonesApi = () => makeApi<ProjectPaymentMilestone>('project_payment_milestones')
const projectsApi   = () => makeApi<Project>('projects')
const invoicesApi   = () => makeApi<Invoice>('invoices')

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Reconcile a project's milestone ledger with its selected schedule.
 * Idempotent: invoiced/paid rows are preserved, pending rows are updated to
 * match the schedule, missing rows inserted. The advance milestone (billed
 * before works) is invoiced immediately; returns that invoice when created.
 */
export async function applyScheduleToProject(project: Project): Promise<Invoice | null> {
  if (!project.id || !project.paymentScheduleId) return null
  const schedule = await schedulesApi().get(project.paymentScheduleId)
  if (!schedule) return null

  const existing = await milestonesApi().list({ filters: { projectId: project.id } })
  const desired = buildMilestoneRows(schedule, project)

  // Drop pending rows that are no longer part of the schedule.
  for (const m of existing) {
    if (m.status === 'pending' && m.id && !desired.some((d) => d.name === m.name)) {
      await milestonesApi().remove(m.id)
    }
  }
  // Insert new rows / refresh pending ones so amounts track the revenue.
  for (const d of desired) {
    const cur = existing.find((m) => m.name === d.name)
    if (!cur) {
      await milestonesApi().create(d)
    } else if (cur.status === 'pending' && cur.id && (
      Number(cur.pct) !== Number(d.pct) ||
      Number(cur.amount) !== Number(d.amount) ||
      (cur.dueDate ?? '') !== (d.dueDate ?? '')
    )) {
      await milestonesApi().update(cur.id, {
        pct: d.pct, amount: d.amount, dueDays: d.dueDays,
        dueDate: d.dueDate, scheduleId: d.scheduleId, scheduleName: d.scheduleName,
      })
    }
  }

  // Advance is billed before works — generate it as soon as the schedule lands.
  const fresh = await milestonesApi().list({ filters: { projectId: project.id } })
  const advance = pendingMilestoneForTrigger(fresh, 'advance')
  return advance ? generateInvoiceForMilestone(advance, project) : null
}

/** Create a draft invoice for one pending milestone and mark it invoiced. */
export async function generateInvoiceForMilestone(
  milestone: ProjectPaymentMilestone,
  project?: Project
): Promise<Invoice | null> {
  if (!milestone.id || milestone.status !== 'pending') return null
  const proj = project ?? (await projectsApi().get(milestone.projectId))
  if (!proj) return null
  const today = todayStr()
  const number = nextNumberFor('INV', await invoicesApi().list({}), today)
  const dueDate = milestone.dueDate ?? addDays(today, 30)
  const invoice = await invoicesApi().create(invoiceFromMilestone(milestone, proj, number, today, dueDate))
  await milestonesApi().update(milestone.id, {
    status: 'invoiced',
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    invoicedAt: new Date().toISOString(),
  })
  return invoice
}

/**
 * PAC/FAC certificate signed → bill the matching pending milestone of the
 * certificate's project (if one is waiting). No-op when there is none, so
 * re-signing or projects without a schedule are safe.
 */
export async function generateInvoiceForCertificate(
  cert: Pick<AcceptanceCertificate, 'id' | 'type' | 'projectId'>
): Promise<Invoice | null> {
  if (!cert.projectId || (cert.type !== 'PAC' && cert.type !== 'FAC')) return null
  const rows = await milestonesApi().list({ filters: { projectId: cert.projectId } })
  const milestone = pendingMilestoneForTrigger(rows, cert.type)
  if (!milestone) return null
  const invoice = await generateInvoiceForMilestone(milestone)
  if (invoice && milestone.id) {
    await milestonesApi().update(milestone.id, { triggerCertificateId: cert.id })
  }
  return invoice
}

/** Keep the milestone ledger in step with its invoice's paid state. */
export async function setMilestoneStatusForInvoice(invoiceId: string, status: MilestoneStatus): Promise<void> {
  const rows = await milestonesApi().list({ filters: { invoiceId } })
  for (const m of rows) {
    if (m.id && m.status !== status) await milestonesApi().update(m.id, { status })
  }
}
