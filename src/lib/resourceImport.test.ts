import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseResourceWorkbook,
  planResourceImport,
  buildResourceTemplateBuffer,
  ENGINEER_SHEET,
  VEHICLE_SHEET,
} from './resourceImport'

function workbook(engRows: Record<string, unknown>[] = [], vehRows: Record<string, unknown>[] = []) {
  const wb = XLSX.utils.book_new()
  if (engRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(engRows), ENGINEER_SHEET)
  if (vehRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vehRows), VEHICLE_SHEET)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('parseResourceWorkbook', () => {
  it('parses engineers and vehicles into typed rows', () => {
    const buf = workbook(
      [{ Name: 'John Rakoto', Role: 'team_leader', 'Daily Rate': 150000, Skills: 'rigging, climbing' }],
      [{ Registration: '1234 TAB', Make: 'Toyota', Model: 'Hilux', Year: 2022, Type: 'pickup' }],
    )
    const p = parseResourceWorkbook(buf)
    expect(p.errors).toHaveLength(0)
    expect(p.engineers).toHaveLength(1)
    expect(p.engineers[0]).toMatchObject({
      name: 'John Rakoto', role: 'team_leader', dailyRate: 150000, skills: ['rigging', 'climbing'],
    })
    expect(p.vehicles).toHaveLength(1)
    expect(p.vehicles[0]).toMatchObject({ registration: '1234 TAB', make: 'Toyota', type: 'pickup', year: 2022 })
  })

  it('skips rows missing Name/Registration and invalid enum values', () => {
    const buf = workbook(
      [{ Role: 'rigger' }, { Name: 'Bad Role', Role: 'astronaut' }],
      [{ Make: 'Toyota' }, { Registration: 'X', Type: 'submarine' }],
    )
    const p = parseResourceWorkbook(buf)
    expect(p.engineers).toHaveLength(0)
    expect(p.vehicles).toHaveLength(0)
    expect(p.errors).toHaveLength(4)
  })

  it('defaults blank role/status and uppercases registration', () => {
    const buf = workbook([{ Name: 'Alice' }], [{ Registration: 'abc 123' }])
    const p = parseResourceWorkbook(buf)
    expect(p.engineers[0].role).toBe('helper')
    expect(p.engineers[0].status).toBe('available')
    expect(p.vehicles[0].registration).toBe('ABC 123')
    expect(p.vehicles[0].status).toBe('available')
  })
})

describe('planResourceImport', () => {
  it('dedupes by name (case-insensitive) and registration, including within-file duplicates', () => {
    const parsed = parseResourceWorkbook(workbook(
      [
        { Name: 'John', Role: 'rigger' },
        { Name: 'Jane', Role: 'driver' },
        { Name: 'john', Role: 'rigger' },
      ],
      [{ Registration: 'ABC 123' }],
    ))
    const plan = planResourceImport(parsed, {
      engineers: [{ name: 'JOHN' }],
      vehicles: [{ registration: 'abc 123' }],
    })
    expect(plan.engineersToCreate.map((e) => e.name)).toEqual(['Jane'])
    expect(plan.duplicateEngineers).toEqual(['John', 'john'])
    expect(plan.vehiclesToCreate).toEqual([])
    expect(plan.duplicateVehicles).toEqual(['ABC 123'])
  })

  it('creates everything when nothing exists yet', () => {
    const parsed = parseResourceWorkbook(workbook(
      [{ Name: 'John', Role: 'rigger' }],
      [{ Registration: 'ABC 123' }],
    ))
    const plan = planResourceImport(parsed, { engineers: [], vehicles: [] })
    expect(plan.engineersToCreate).toHaveLength(1)
    expect(plan.vehiclesToCreate).toHaveLength(1)
    expect(plan.duplicateEngineers).toEqual([])
    expect(plan.duplicateVehicles).toEqual([])
  })
})

describe('buildResourceTemplateBuffer', () => {
  it('produces a workbook with both sheets', () => {
    const wb = XLSX.read(buildResourceTemplateBuffer(), { type: 'array' })
    expect(wb.SheetNames).toContain(ENGINEER_SHEET)
    expect(wb.SheetNames).toContain(VEHICLE_SHEET)
  })
})
