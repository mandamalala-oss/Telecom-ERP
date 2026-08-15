// Field-op crew assignment rules.
//
// Crew roles (Team Leader / Technician / Rigger / Driver) are "one field op
// at a time": a member still on a NOT-yet-approved operation cannot be added
// to a new one. Managers / inspectors / CEO can be on many (not gated here).

export const CREW_KEYS = ['teamLeaderId', 'technicianId', 'riggerId', 'driverId'] as const

export interface FieldOpLike {
  id?: string
  status?: string | null
  siteCode?: string | null
  projectName?: string | null
  [key: string]: any
}

// The status that marks each field-op type as finished; anything else means
// the operation is still in progress.
const TERMINAL = { survey: 'approved', installation: 'approved', integration: 'accepted' } as const

/**
 * employeeId → human description, for every crew member still assigned to an
 * in-progress field operation. `editingId` (the record currently being saved)
 * is ignored, so editing an operation doesn't flag its own crew.
 */
export function findBusyCrew(
  data: { surveys: FieldOpLike[]; installs: FieldOpLike[]; integs: FieldOpLike[] },
  editingId?: string
): Map<string, string> {
  const busy = new Map<string, string>()
  const scan = (rows: FieldOpLike[], kind: 'survey' | 'installation' | 'integration') => {
    for (const r of rows) {
      if (editingId && r.id === editingId) continue
      if (r.status === TERMINAL[kind]) continue
      for (const k of CREW_KEYS) {
        const id = r[k]
        if (id && !busy.has(id)) {
          busy.set(id, `${kind} · ${r.siteCode ?? 'no site'}${r.projectName ? ` (${r.projectName})` : ''}`)
        }
      }
    }
  }
  scan(data.surveys, 'survey')
  scan(data.installs, 'installation')
  scan(data.integs, 'integration')
  return busy
}
