import { describe, it, expect } from 'vitest'
import { findBusyCrew, planResourceStatusUpdates, CREW_KEYS } from './fieldOps'

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

describe('planResourceStatusUpdates', () => {
  const fullValues = {
    status: 'survey_started',
    teamLeaderId: 'e1',
    technicianId: 'e2',
    riggerId: 'e3',
    driverId: 'e4',
    vehicleId: 'v1',
  }

  it('assigns new crew and vehicle on create (no previous record)', () => {
    const plan = planResourceStatusUpdates(fullValues, null, 'approved')
    expect(plan.employeeUpdates).toEqual([
      { id: 'e1', status: 'assigned' },
      { id: 'e2', status: 'assigned' },
      { id: 'e3', status: 'assigned' },
      { id: 'e4', status: 'assigned' },
    ])
    expect(plan.vehicleUpdates).toEqual([{ id: 'v1', status: 'in_use' }])
  })

  it('releases a swapped-out rigger while assigning the new one', () => {
    const previous = { ...fullValues, riggerId: 'old-rigger' }
    const next = { ...fullValues, riggerId: 'new-rigger' }
    const plan = planResourceStatusUpdates(next, previous, 'approved')
    expect(plan.employeeUpdates).toContainEqual({ id: 'new-rigger', status: 'assigned' })
    expect(plan.employeeUpdates).toContainEqual({ id: 'old-rigger', status: 'available' })
    expect(plan.employeeUpdates).not.toContainEqual({ id: 'old-rigger', status: 'assigned' })
  })

  it('releases a cleared crew slot back to available', () => {
    const previous = { ...fullValues }
    const next = { ...fullValues, riggerId: undefined }
    const plan = planResourceStatusUpdates(next, previous, 'approved')
    expect(plan.employeeUpdates).toContainEqual({ id: 'e3', status: 'available' })
    expect(plan.employeeUpdates).not.toContainEqual({ id: 'e3', status: 'assigned' })
  })

  it('releases a replaced or cleared vehicle', () => {
    const previous = { ...fullValues, vehicleId: 'v-old' }
    const next = { ...fullValues, vehicleId: 'v-new' }
    const plan = planResourceStatusUpdates(next, previous, 'approved')
    expect(plan.vehicleUpdates).toContainEqual({ id: 'v-old', status: 'available' })
    expect(plan.vehicleUpdates).toContainEqual({ id: 'v-new', status: 'in_use' })
  })

  it('releases all crew and vehicle when the op reaches its terminal status', () => {
    const previous = { ...fullValues, status: 'survey_started' }
    const next = { ...fullValues, status: 'approved' }
    const plan = planResourceStatusUpdates(next, previous, 'approved')
    expect(plan.employeeUpdates).toContainEqual({ id: 'e1', status: 'available' })
    expect(plan.vehicleUpdates).toContainEqual({ id: 'v1', status: 'available' })
    expect(plan.employeeUpdates.some((u) => u.status === 'assigned')).toBe(false)
  })

  it('does not touch unchanged crew beyond keeping them assigned', () => {
    const previous = { ...fullValues }
    const plan = planResourceStatusUpdates({ ...fullValues }, previous, 'approved')
    expect(plan.employeeUpdates.filter((u) => u.status === 'assigned')).toHaveLength(4)
    expect(plan.employeeUpdates.filter((u) => u.status === 'available')).toHaveLength(0)
  })
})
