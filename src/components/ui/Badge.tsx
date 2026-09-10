import { clsx } from 'clsx'

const variants: Record<string, string> = {
  blue:    'bg-blue-100   text-blue-800   dark:bg-blue-900/40   dark:text-blue-300',
  green:   'bg-green-100  text-green-800  dark:bg-green-900/40  dark:text-green-300',
  amber:   'bg-amber-100  text-amber-800  dark:bg-amber-900/40  dark:text-amber-300',
  red:     'bg-red-100    text-red-800    dark:bg-red-900/40    dark:text-red-300',
  purple:  'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  cyan:    'bg-cyan-100   text-cyan-800   dark:bg-cyan-900/40   dark:text-cyan-300',
  slate:   'bg-slate-100  text-slate-700  dark:bg-slate-700     dark:text-slate-300',
  orange:  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  indigo:  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
}

const statusMap: Record<string, string> = {
  // site status
  planned: 'slate', survey: 'blue', installation: 'amber', integration: 'purple',
  atp: 'cyan', acceptance: 'orange', live: 'green', decommissioned: 'red',
  // project
  not_started: 'slate', in_progress: 'blue', on_hold: 'amber', completed: 'green', cancelled: 'red',
  // tasks / field-ops workflow
  backlog: 'slate', todo: 'blue', review: 'purple', done: 'green',
  pending: 'slate', assigned: 'blue', survey_started: 'blue', survey_completed: 'green',
  material_delivered: 'amber', install_started: 'blue', install_completed: 'green',
  quality_check: 'purple', integrated: 'green',
  // atp
  submitted: 'blue', reviewed: 'purple', customer_accepted: 'green', failed: 'red',
  // acceptance certificates (PAC / FAC)
  issued: 'cyan', signed: 'green',
  // payment milestones
  invoiced: 'cyan',
  // priority
  low: 'slate', medium: 'blue', high: 'amber', critical: 'red',
  // lead/opp
  new: 'blue', contacted: 'purple', qualified: 'green', unqualified: 'red',
  prospecting: 'slate', proposal: 'blue', negotiation: 'amber',
  closed_won: 'green', closed_lost: 'red',
  // finance
  draft: 'slate', sent: 'blue', accepted: 'green', rejected: 'red', expired: 'amber',
  partially_paid: 'amber', paid: 'green', overdue: 'red',
  approved: 'green', partial: 'amber', received: 'green',
  // supply delivery
  delivered: 'green',
  // procurement
  pending_approval: 'amber', po_raised: 'cyan',
  // dms
  under_review: 'amber', superseded: 'slate', archived: 'slate',
  // company
  active: 'green', inactive: 'slate',
  // customer vendor
  nokia: 'blue', huawei: 'red', other: 'slate',
  // resources
  available: 'green', in_use: 'blue', maintenance: 'amber', breakdown: 'red',
  on_leave: 'amber', sick: 'red', training: 'purple', unavailable: 'slate',
  good: 'green', fair: 'amber', poor: 'red', requires_calibration: 'red',
  // tech
  '2G': 'slate', '3G': 'blue', '4G': 'green', '4G+': 'cyan', '5G': 'purple', 'MW': 'amber', 'VSAT': 'orange',
}

interface BadgeProps {
  status?: string
  variant?: string
  children?: React.ReactNode
  className?: string
  dot?: boolean
}

export function Badge({ status, variant, children, className, dot }: BadgeProps) {
  const v = variant ?? (status ? statusMap[status] : 'slate') ?? 'slate'
  // Unknown/typo'd variants fall back to the neutral slate style instead of
  // rendering unstyled.
  const cls = variants[v] ?? variants.slate
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap', cls, className)}>
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full', v === 'green' ? 'bg-green-500' : v === 'red' ? 'bg-red-500' : 'bg-current')} />}
      {children ?? (status ? status.replace(/_/g, ' ') : '')}
    </span>
  )
}
