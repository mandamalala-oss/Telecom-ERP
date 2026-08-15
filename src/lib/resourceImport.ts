import * as XLSX from 'xlsx'
import type { Employee, EmployeeRole, EmployeeStatus, Vehicle } from '@/types/v2'

/**
 * Excel import for Resource Mgmt (engineers + vehicles).
 *
 * Expected workbook: two optional sheets, each with a header row —
 *   "Engineers":  Name | Employee Number | Role | Department | Email | Phone | Skills | Status | Daily Rate | Joined
 *   "Vehicles":   Registration | Make | Model | Year | Type | Driver Name | Odometer | Fuel Type | Status | Notes
 *
 * Dedupe keys: engineer `Name` (case-insensitive) and vehicle `Registration`.
 * Blank optional fields fall back to DB defaults (role → 'Technician', status → 'available').
 */

export const ENGINEER_SHEET = 'Engineers'
export const VEHICLE_SHEET = 'Vehicles'

const EMPLOYEE_ROLES = ['Team Leader', 'Technician', 'Rigger', 'Driver', 'Inspector', 'Manager', 'CEO'] as const
const EMPLOYEE_STATUSES = ['available', 'assigned', 'on_leave', 'sick', 'training', 'unavailable'] as const
const VEHICLE_TYPES = ['4x4', 'pickup', 'van', 'crane', 'flatbed', 'motorcycle'] as const
const VEHICLE_STATUSES = ['available', 'in_use', 'maintenance', 'breakdown'] as const
const FUEL_TYPES = ['petrol', 'diesel'] as const

/** First literal in `list` matching `raw` case-insensitively — narrows without casting. */
function pick<T extends string>(list: readonly T[], raw: string): T | undefined {
  return list.find((v) => v.toLowerCase() === raw.toLowerCase())
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim())
const num = (v: unknown): number | undefined => {
  if (v === '' || v === undefined || v === null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export interface ParsedEngineer {
  name: string
  employeeNumber?: string
  role: EmployeeRole
  department?: string
  email?: string
  phone?: string
  skills: string[]
  status: EmployeeStatus
  dailyRate?: number
  joinedAt?: string
}

export interface ParsedVehicle {
  registration: string
  make?: string
  model?: string
  year?: number
  type?: Vehicle['type']
  driverName?: string
  currentOdometer?: number
  fuelType?: Vehicle['fuelType']
  status: Vehicle['status']
  notes?: string
}

export interface ParsedWorkbook {
  engineers: ParsedEngineer[]
  vehicles: ParsedVehicle[]
  errors: string[]
}

/** Read a workbook (ArrayBuffer) into typed engineer/vehicle rows. */
export function parseResourceWorkbook(buffer: ArrayBuffer): ParsedWorkbook {
  const wb = XLSX.read(buffer, { type: 'array' })
  const out: ParsedWorkbook = { engineers: [], vehicles: [], errors: [] }

  const sheet = (name: string): Record<string, unknown>[] => {
    const ws = wb.Sheets[name]
    return ws ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' }) : []
  }

  sheet(ENGINEER_SHEET).forEach((r, i) => {
    const name = str(r['Name'])
    if (!name) {
      out.errors.push(`Engineers — row ${i + 2}: missing "Name", skipped`)
      return
    }
    const roleRaw = str(r['Role'])
    const role = roleRaw ? pick(EMPLOYEE_ROLES, roleRaw) : undefined
    if (roleRaw && !role) {
      out.errors.push(`Engineers — "${name}": unknown Role "${str(r['Role'])}", skipped`)
      return
    }
    const statusRaw = str(r['Status']).toLowerCase()
    const status = statusRaw ? pick(EMPLOYEE_STATUSES, statusRaw) : undefined
    if (statusRaw && !status) {
      out.errors.push(`Engineers — "${name}": unknown Status "${str(r['Status'])}", skipped`)
      return
    }
    out.engineers.push({
      name,
      employeeNumber: str(r['Employee Number']) || undefined,
      role: role ?? 'Technician',
      department: str(r['Department']) || undefined,
      email: str(r['Email']) || undefined,
      phone: str(r['Phone']) || undefined,
      skills: str(r['Skills']).split(',').map((s) => s.trim()).filter(Boolean),
      status: status ?? 'available',
      dailyRate: num(r['Daily Rate']),
      joinedAt: str(r['Joined']) ? str(r['Joined']).slice(0, 10) : undefined,
    })
  })

  sheet(VEHICLE_SHEET).forEach((r, i) => {
    const registration = str(r['Registration']).toUpperCase()
    if (!registration) {
      out.errors.push(`Vehicles — row ${i + 2}: missing "Registration", skipped`)
      return
    }
    const typeRaw = str(r['Type']).toLowerCase()
    const type = typeRaw ? pick(VEHICLE_TYPES, typeRaw) : undefined
    if (typeRaw && !type) {
      out.errors.push(`Vehicles — "${registration}": unknown Type "${str(r['Type'])}", skipped`)
      return
    }
    const fuelRaw = str(r['Fuel Type']).toLowerCase()
    const fuelType = fuelRaw ? pick(FUEL_TYPES, fuelRaw) : undefined
    if (fuelRaw && !fuelType) {
      out.errors.push(`Vehicles — "${registration}": unknown Fuel Type "${str(r['Fuel Type'])}", skipped`)
      return
    }
    const statusRaw = str(r['Status']).toLowerCase()
    const status = statusRaw ? pick(VEHICLE_STATUSES, statusRaw) : undefined
    if (statusRaw && !status) {
      out.errors.push(`Vehicles — "${registration}": unknown Status "${str(r['Status'])}", skipped`)
      return
    }
    out.vehicles.push({
      registration,
      make: str(r['Make']) || undefined,
      model: str(r['Model']) || undefined,
      year: num(r['Year']),
      type: type || undefined,
      driverName: str(r['Driver Name']) || undefined,
      currentOdometer: num(r['Odometer']),
      fuelType: fuelType || undefined,
      status: status ?? 'available',
      notes: str(r['Notes']) || undefined,
    })
  })

  return out
}

export interface ImportPlan {
  engineersToCreate: ParsedEngineer[]
  vehiclesToCreate: ParsedVehicle[]
  duplicateEngineers: string[]
  duplicateVehicles: string[]
}

/** Split parsed rows into "to create" vs "already exists" (dedupe by name / registration). */
export function planResourceImport(
  parsed: ParsedWorkbook,
  existing: { engineers: Pick<Employee, 'name'>[]; vehicles: Pick<Vehicle, 'registration'>[] }
): ImportPlan {
  const engNames = new Set(existing.engineers.map((e) => (e.name ?? '').trim().toLowerCase()))
  const vehRegs = new Set(existing.vehicles.map((v) => (v.registration ?? '').trim().toLowerCase()))

  const duplicateEngineers: string[] = []
  const engineersToCreate: ParsedEngineer[] = []
  for (const e of parsed.engineers) {
    const key = e.name.trim().toLowerCase()
    if (engNames.has(key)) duplicateEngineers.push(e.name)
    else {
      engineersToCreate.push(e)
      engNames.add(key)
    }
  }

  const duplicateVehicles: string[] = []
  const vehiclesToCreate: ParsedVehicle[] = []
  for (const v of parsed.vehicles) {
    const key = v.registration.trim().toLowerCase()
    if (vehRegs.has(key)) duplicateVehicles.push(v.registration)
    else {
      vehiclesToCreate.push(v)
      vehRegs.add(key)
    }
  }

  return { engineersToCreate, vehiclesToCreate, duplicateEngineers, duplicateVehicles }
}

/** Generate a starter workbook with both sheets + one example row each. */
export function buildResourceTemplateBuffer(): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        Name: 'John Rakoto',
        'Employee Number': 'EMP-001',
        Role: 'Team Leader',
        Department: 'Field',
        Email: 'john@example.com',
        Phone: '+261 32 00 000 00',
        Skills: 'rigging, climbing',
        Status: 'available',
        'Daily Rate': 150000,
        Joined: '2026-08-01',
      },
    ]),
    ENGINEER_SHEET
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      {
        Registration: '1234 TAB',
        Make: 'Toyota',
        Model: 'Hilux',
        Year: 2022,
        Type: 'pickup',
        'Driver Name': 'Jean',
        Odometer: 12000,
        'Fuel Type': 'diesel',
        Status: 'available',
        Notes: '',
      },
    ]),
    VEHICLE_SHEET
  )
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
