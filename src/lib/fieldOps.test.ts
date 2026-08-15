import { describe, it, expect } from 'vitest'
import { findBusyCrew, CREW_KEYS } from './fieldOps'

const op = (over: Record<string, any>): any => ({
  id: over.id ?? 'op-1', status: over.status ?? 'pending', siteCode: over.siteCode ?? 'MDG-001',
  projectName: over.projectName ?? 'STARLINK', ...over,
})

describe('findBusyCrew', () => {
  it('returns crew members still on in-progress ops', () => {
    const busy = findBusyCrew({
      surveys: [op({ id: 's1', teamLeaderId: 'e1', status: 'survey_started' })],
      installs: [op({ id: 'i1', technicianId: 'e2', status: 'pending' })],
      integs: [op({ id: 'g1', riggerId: 'e3', status: 'testing' })],
    })
    expect(busy.has('e1')).toBe(true)
    expect(busy.has('e2')).toBe(true)
    expect(busy.has('e3')).toBe(true)
    expect(busy.get('e1')).toContain('MDG-001')
  })

  it('ignores crew on approved/accepted (terminal) ops', () => {
    const busy = findBusyCrew({
      surveys: [op({ id: 's1', teamLeaderId: 'e1', status: 'approved' })],
      installs: [op({ id: 'i1', technicianId: 'e2', status: 'approved' })],
      integs: [op({ id: 'g1', riggerId: 'e3', status: 'accepted' })],
    })
    expect(busy.size).toBe(0)
  })

  it('excludes the record currently being edited', () => {
    const busy = findBusyCrew(
      { surveys: [op({ id: 's1', teamLeaderId: 'e1', status: 'survey_started' })], installs: [], integs: [] },
      's1'
    )
    expect(busy.has('e1')).toBe(false)
  })

  it('does not flag non-crew fields (project manager, vehicle)', () => {
    const busy = findBusyCrew({
      surveys: [op({ id: 's1', projectManagerId: 'pm1', vehicleId: 'v1', status: 'planned' })],
      installs: [],
      integs: [],
    })
    expect(busy.size).toBe(0)
  })

  it('exposes the four crew keys', () => {
    expect(CREW_KEYS).toEqual(['teamLeaderId', 'technicianId', 'riggerId', 'driverId'])
  })
})
