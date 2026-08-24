import { useRef, useState } from 'react'
import { Plus, AlertTriangle, Trash2, Pencil, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { TABLES } from '@/lib/api/entityConfigs'
import { supabase } from '@/lib/supabase'
import type { Employee, Vehicle, Tool } from '@/types/v2'
import { clsx } from 'clsx'
import * as XLSX from 'xlsx'

// ─── Import Excel ────────────────────────────────────────────────
// Un classeur peut contenir jusqu'à 3 onglets : "Engineers", "Vehicles", "Tools".
// Onglets absents = simplement ignorés (pas d'erreur).

const VALID_ROLES = ['pm','supervisor','rigger','civil_engineer','rf_engineer','mw_engineer','integration_engineer','hse_officer','driver','helper'] as const
const VALID_EMP_STATUS = ['available','assigned','on_leave','sick','training','unavailable'] as const
const VALID_VEH_TYPE = ['4x4','pickup','van','crane','flatbed','motorcycle'] as const
const VALID_VEH_STATUS = ['available','in_use','maintenance','breakdown'] as const
const VALID_FUEL = ['petrol','diesel'] as const
const VALID_CONDITION = ['good','fair','poor','requires_calibration'] as const

type SkipReason = { row: number; reason: string }
type SheetResult = { sheet: string; inserted: number; skipped: SkipReason[] }

function normKey(s: string) { return s.trim().toLowerCase() }

function findSheet(workbook: XLSX.WorkBook, ...names: string[]): string | null {
  const found = workbook.SheetNames.find(n => names.some(target => normKey(n) === normKey(target)))
  return found ?? null
}

function splitList(value: unknown): string[] {
  if (!value) return []
  return String(value).split(',').map(v => v.trim()).filter(Boolean)
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toDateStr(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const s = String(value).trim()
  return s || null
}

function rowsOf(workbook: XLSX.WorkBook, sheetName: string) {
  return XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' })
}

// ── Engineers ──────────────────────────────────────────────────
function mapEngineers(workbook: XLSX.WorkBook): (SheetResult & { payload: any[] }) | null {
  const sheetName = findSheet(workbook, 'Engineers')
  if (!sheetName) return null
  const rows = rowsOf(workbook, sheetName)
  const payload: any[] = []
  const skipped: SkipReason[] = []

  rows.forEach((row, idx) => {
    const n = idx + 2
    const name = String(row['Name'] ?? '').trim()
    const roleRaw = String(row['Role'] ?? '').trim().toLowerCase().replace(/\s+/g, '_')
    const statusRaw = String(row['Status'] ?? 'available').trim().toLowerCase().replace(/\s+/g, '_')

    if (!name) { skipped.push({ row: n, reason: 'Nom manquant' }); return }
    if (!VALID_ROLES.includes(roleRaw as any)) {
      skipped.push({ row: n, reason: `Rôle invalide "${row['Role']}" (attendu: ${VALID_ROLES.join(', ')})` })
      return
    }
    if (!VALID_EMP_STATUS.includes(statusRaw as any)) {
      skipped.push({ row: n, reason: `Statut invalide "${row['Status']}" (attendu: ${VALID_EMP_STATUS.join(', ')})` })
      return
    }

    payload.push({
      name,
      employee_number: String(row['Employee Number'] ?? '').trim() || null,
      role: roleRaw,
      department: String(row['Department'] ?? '').trim() || null,
      email: String(row['Email'] ?? '').trim() || null,
      phone: String(row['Phone'] ?? '').trim() || null,
      skills: splitList(row['Skills']),
      status: statusRaw,
      daily_rate: toNumber(row['Daily Rate']),
      joined_at: toDateStr(row['Joined']),
    })
  })

  return { sheet: sheetName, inserted: payload.length, skipped, payload }
}

// ── Vehicles ───────────────────────────────────────────────────
function mapVehicles(workbook: XLSX.WorkBook): (SheetResult & { payload: any[] }) | null {
  const sheetName = findSheet(workbook, 'Vehicles')
  if (!sheetName) return null
  const rows = rowsOf(workbook, sheetName)
  const payload: any[] = []
  const skipped: SkipReason[] = []

  rows.forEach((row, idx) => {
    const n = idx + 2
    const registration = String(row['Registration'] ?? '').trim()
    const typeRaw = String(row['Type'] ?? '').trim().toLowerCase()
    const statusRaw = String(row['Status'] ?? 'available').trim().toLowerCase().replace(/\s+/g, '_')
    const fuelRaw = String(row['Fuel Type'] ?? '').trim().toLowerCase()

    if (!registration) { skipped.push({ row: n, reason: 'Immatriculation manquante' }); return }
    if (typeRaw && !VALID_VEH_TYPE.includes(typeRaw as any)) {
      skipped.push({ row: n, reason: `Type invalide "${row['Type']}" (attendu: ${VALID_VEH_TYPE.join(', ')})` })
      return
    }
    if (!VALID_VEH_STATUS.includes(statusRaw as any)) {
      skipped.push({ row: n, reason: `Statut invalide "${row['Status']}" (attendu: ${VALID_VEH_STATUS.join(', ')})` })
      return
    }
    if (fuelRaw && !VALID_FUEL.includes(fuelRaw as any)) {
      skipped.push({ row: n, reason: `Carburant invalide "${row['Fuel Type']}" (attendu: ${VALID_FUEL.join(', ')})` })
      return
    }

    payload.push({
      registration,
      make: String(row['Make'] ?? '').trim() || null,
      model: String(row['Model'] ?? '').trim() || null,
      year: row['Year'] ? toNumber(row['Year']) : null,
      type: typeRaw || null,
      status: statusRaw,
      driver_name: String(row['Driver Name'] ?? '').trim() || null,
      current_odometer: toNumber(row['Odometer']),
      fuel_type: fuelRaw || null,
      notes: String(row['Notes'] ?? '').trim() || null,
    })
  })

  return { sheet: sheetName, inserted: payload.length, skipped, payload }
}

// ── Tools ──────────────────────────────────────────────────────
function mapTools(workbook: XLSX.WorkBook): (SheetResult & { payload: any[] }) | null {
  const sheetName = findSheet(workbook, 'Tools')
  if (!sheetName) return null
  const rows = rowsOf(workbook, sheetName)
  const payload: any[] = []
  const skipped: SkipReason[] = []

  rows.forEach((row, idx) => {
    const n = idx + 2
    const toolCode = String(row['Tool Code'] ?? row['Code'] ?? '').trim()
    const name = String(row['Name'] ?? '').trim()
    const conditionRaw = String(row['Condition'] ?? 'good').trim().toLowerCase().replace(/\s+/g, '_')

    if (!toolCode) { skipped.push({ row: n, reason: 'Code outil manquant' }); return }
    if (!name) { skipped.push({ row: n, reason: 'Nom manquant' }); return }
    if (!VALID_CONDITION.includes(conditionRaw as any)) {
      skipped.push({ row: n, reason: `État invalide "${row['Condition']}" (attendu: ${VALID_CONDITION.join(', ')})` })
      return
    }

    payload.push({
      tool_code: toolCode,
      name,
      category: String(row['Category'] ?? '').trim() || null,
      serial_number: String(row['Serial #'] ?? row['Serial Number'] ?? '').trim() || null,
      condition: conditionRaw,
      assigned_to: String(row['Assigned To'] ?? '').trim() || null,
      assigned_project: String(row['Assigned Project'] ?? '').trim() || null,
      last_calibration: toDateStr(row['Last Calib'] ?? row['Last Calibration']),
      next_calibration: toDateStr(row['Next Calib'] ?? row['Next Calibration']),
      notes: String(row['Notes'] ?? '').trim() || null,
    })
  })

  return { sheet: sheetName, inserted: payload.length, skipped, payload }
}

type Tab = 'engineers' | 'vehicles' | 'tools'

const ROLE_LABEL: Record<string, string> = {
  pm:'Project Manager', supervisor:'Supervisor', rigger:'Rigger',
  civil_engineer:'Civil Engineer', rf_engineer:'RF Engineer',
  mw_engineer:'MW Engineer', integration_engineer:'Integration Engineer',
  hse_officer:'HSE Officer', driver:'Driver', helper:'Helper',
}

const STATUS_COLOR: Record<string, string> = {
  available:'bg-green-100 text-green-700', assigned:'bg-blue-100 text-blue-700',
  on_leave:'bg-amber-100 text-amber-700', sick:'bg-red-100 text-red-700',
  training:'bg-purple-100 text-purple-700', unavailable:'bg-slate-100 text-slate-500',
}

const VEH_STATUS: Record<string, string> = {
  available:'bg-green-100 text-green-700', in_use:'bg-blue-100 text-blue-700',
  maintenance:'bg-amber-100 text-amber-700', breakdown:'bg-red-100 text-red-700',
}

const fmt = (n: number) => `${n.toLocaleString()} Ar`

function isExpiringSoon(date?: string) {
  if (!date) return false
  const d = new Date(date)
  return d > new Date() && d < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
}

export function ResourceModule() {
  const { data: employees, error: empErr, openCreate: newEmp, openEdit: editEmp, remove: removeEmp, modal: empModal, refresh: refreshEmp } = useEntityCrud<Employee>(TABLES.employees, 'Employee')
  const { data: vehicles, error: vehErr, openCreate: newVeh, openEdit: editVeh, remove: removeVeh, modal: vehModal, refresh: refreshVeh } = useEntityCrud<Vehicle>(TABLES.vehicles, 'Vehicle')
  const { data: tools, error: toolErr, openCreate: newTool, openEdit: editTool, remove: removeTool, modal: toolModal, refresh: refreshTool } = useEntityCrud<Tool>(TABLES.tools, 'Tool')
  const [tab, setTab] = useState<Tab>('engineers')
  const [selEmp, setSelEmp]     = useState<Employee | null>(null)
  const [selVeh, setSelVeh]     = useState<Vehicle | null>(null)
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<string[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImportClick = () => fileInputRef.current?.click()

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setImporting(true)
    setImportSummary(null)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })

      const results: (SheetResult & { payload: any[] })[] = []
      const eng = mapEngineers(workbook); if (eng) results.push(eng)
      const veh = mapVehicles(workbook); if (veh) results.push(veh)
      const too = mapTools(workbook); if (too) results.push(too)

      if (results.length === 0) {
        setImportSummary(['Aucun onglet reconnu — attendu : "Engineers", "Vehicles" et/ou "Tools".'])
        return
      }

      const tableFor: Record<string, string> = { Engineers: 'employees', Vehicles: 'vehicles', Tools: 'tools' }
      const lines: string[] = []

      for (const r of results) {
        const table = tableFor[Object.keys(tableFor).find(k => normKey(k) === normKey(r.sheet)) ?? '']
        if (r.payload.length > 0 && table) {
          const { error: insertError } = await supabase.from(table).insert(r.payload)
          if (insertError) {
            lines.push(`${r.sheet} : échec de l'import — ${insertError.message}`)
            continue
          }
        }
        let line = `${r.sheet} : ${r.inserted} importé(s)`
        if (r.skipped.length > 0) line += ` — ${r.skipped.length} ignoré(s) : ${r.skipped.map(s => `ligne ${s.row} (${s.reason})`).join(' ; ')}`
        lines.push(line)
      }

      setImportSummary(lines)
      await Promise.all([refreshEmp?.(), refreshVeh?.(), refreshTool?.()])
    } catch (err: any) {
      setImportSummary([`Échec de l'import : ${err.message ?? 'erreur inconnue'}`])
    } finally {
      setImporting(false)
    }
  }

  const available   = employees.filter(e => e.status === 'available').length
  const vehAvail    = vehicles.filter(v => v.status === 'available').length
  const toolsCalib  = tools.filter(t => isExpiringSoon(t.nextCalibration)).length

  const addForTab = () => tab === 'engineers' ? newEmp() : tab === 'vehicles' ? newVeh() : newTool()
  const errorForTab = tab === 'engineers' ? empErr : tab === 'vehicles' ? vehErr : toolErr
  const handleDeleteEmp = async (id: string) => { if (confirm('Delete this employee?')) { await removeEmp(id); setSelEmp(null) } }
  const handleDeleteVeh = async (id: string) => { if (confirm('Delete this vehicle?')) { await removeVeh(id); setSelVeh(null) } }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l:'Total Engineers', v:employees.length,  color:'text-blue-600' },
          { l:'Available',       v:available,              color:'text-green-600' },
          { l:'Vehicles Ready',  v:vehAvail,               color:'text-purple-600' },
          { l:'Tools Due Calib', v:toolsCalib,             color:toolsCalib>0?'text-red-600':'text-green-600' },
        ].map(s => (
          <Card key={s.l} className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.l}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.v}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {(['engineers','vehicles','tools'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-md capitalize transition-all ${tab===t?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportFile} className="hidden" />
          <Button variant="secondary" icon={<Upload className="w-4 h-4"/>} onClick={handleImportClick} disabled={importing}>
            {importing ? 'Import en cours…' : 'Importer Excel'}
          </Button>
          <Button icon={<Plus className="w-4 h-4"/>} onClick={addForTab}>Add {tab.slice(0,-1)}</Button>
        </div>
      </div>
      {importSummary && (
        <div className="space-y-1">
          {importSummary.map((line, i) => (
            <div key={i} className={clsx('text-sm rounded-lg p-3', line.includes('échec') || line.includes('Échec') ? 'text-red-600 bg-red-50 dark:bg-red-900/20' : 'text-green-700 bg-green-50 dark:bg-green-900/20')}>
              {line}
            </div>
          ))}
        </div>
      )}
      {errorForTab && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{errorForTab}</div>}

      {/* Engineers */}
      {tab === 'engineers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {employees.map(emp => {
            const expiring = (emp.certifications??[]).filter(c => isExpiringSoon(c.expiresAt))
            return (
              <Card key={emp.id} hover padding={false} onClick={() => setSelEmp(emp)} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                      {emp.name.split(' ').map(w=>w[0]).slice(0,2).join('')}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{emp.name}</p>
                      <p className="text-xs text-slate-500">{ROLE_LABEL[emp.role] ?? emp.role}</p>
                    </div>
                  </div>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-bold capitalize', STATUS_COLOR[emp.status])}>
                    {emp.status.replace('_',' ')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(emp.skills??[]).slice(0,3).map(s => (
                    <span key={s} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded font-medium">{s}</span>
                  ))}
                  {(emp.skills??[]).length > 3 && <span className="text-xs text-slate-400">+{(emp.skills??[]).length-3}</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs">
                  <div><p className="text-slate-400">Certs</p><p className="font-bold">{(emp.certifications??[]).length}</p></div>
                  <div><p className="text-slate-400">Daily Rate</p><p className="font-bold">{fmt(emp.dailyRate)}</p></div>
                </div>
                {expiring.length > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0"/>
                    {expiring.length} cert{expiring.length>1?'s':''} expiring soon
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Vehicles */}
      {tab === 'vehicles' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vehicles.map(veh => {
            const serviceAlert = veh.nextServiceDate && isExpiringSoon(veh.nextServiceDate)
            return (
              <Card key={veh.id} hover padding={false} onClick={() => setSelVeh(veh)} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">{veh.registration}</p>
                    <p className="text-xs text-slate-500">{veh.make} {veh.model} ({veh.year}) · {veh.type}</p>
                  </div>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-bold capitalize', VEH_STATUS[veh.status])}>
                    {veh.status.replace('_',' ')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-slate-400">Driver</p><p className="font-semibold">{veh.driverName ?? '—'}</p></div>
                  <div><p className="text-slate-400">Odometer</p><p className="font-semibold">{(veh.currentOdometer??0).toLocaleString()} km</p></div>
                  <div><p className="text-slate-400">Last Service</p><p className="font-semibold">{veh.lastServiceDate ?? '—'}</p></div>
                  <div><p className="text-slate-400">Next Service</p>
                    <p className={clsx('font-semibold', serviceAlert ? 'text-amber-600' : '')}>{veh.nextServiceDate ?? '—'}</p>
                  </div>
                </div>
                {serviceAlert && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1">
                    <AlertTriangle className="w-3 h-3"/>Service due soon
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Tools */}
      {tab === 'tools' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['Code','Name','Category','Serial #','Condition','Assigned To','Last Calib','Next Calib',''].map(h=><th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {tools.map(tool => {
                  const calibAlert = isExpiringSoon(tool.nextCalibration)
                  return (
                    <tr key={tool.id} className="tr-hover">
                      <td className="td font-mono text-xs font-bold text-brand-600">{tool.toolCode}</td>
                      <td className="td font-semibold">{tool.name}</td>
                      <td className="td text-xs text-slate-500">{tool.category}</td>
                      <td className="td font-mono text-xs">{tool.serialNumber ?? '—'}</td>
                      <td className="td capitalize text-xs text-slate-500">{tool.condition}</td>
                      <td className="td text-xs">{tool.assignedTo ?? '—'}</td>
                      <td className="td text-xs text-slate-500">{tool.lastCalibration ?? '—'}</td>
                      <td className={clsx('td text-xs font-semibold', calibAlert?'text-amber-600':'text-slate-500')}>
                        {calibAlert && <AlertTriangle className="w-3 h-3 inline mr-1"/>}
                        {tool.nextCalibration ?? '—'}
                      </td>
                      <td className="td whitespace-nowrap">
                        <div className="flex gap-1">
                          <button onClick={() => editTool(tool)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => { if (confirm('Delete this tool?')) removeTool(tool.id!) }} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Employee Detail */}
      {selEmp && (
        <Modal open title={selEmp.name} onClose={() => setSelEmp(null)} size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDeleteEmp(selEmp.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { editEmp(selEmp); setSelEmp(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                {l:'Employee #',v:selEmp.employeeNumber},{l:'Role',v:ROLE_LABEL[selEmp.role]??selEmp.role},
                {l:'Department',v:selEmp.department},{l:'Status',v:selEmp.status?.replace('_',' ')},
                {l:'Email',v:selEmp.email},{l:'Phone',v:selEmp.phone},
                {l:'Daily Rate',v:fmt(selEmp.dailyRate)},{l:'Joined',v:selEmp.joinedAt},
              ].map(item=>(
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 capitalize">{item.v}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Skills</p>
              <div className="flex flex-wrap gap-2">
                {(selEmp.skills??[]).map(s=><span key={s} className="px-2 py-1 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 rounded text-xs font-semibold">{s}</span>)}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Certifications</p>
              {(selEmp.certifications??[]).map(cert=>{
                const expiring = isExpiringSoon(cert.expiresAt)
                return (
                  <div key={cert.id} className={clsx('flex items-center justify-between p-3 rounded-lg mb-2', expiring?'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800':'bg-slate-50 dark:bg-slate-700/30')}>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{cert.name}</p>
                      <p className="text-xs text-slate-500">Issued by {cert.issuedBy} · {cert.issuedAt}</p>
                    </div>
                    <div className="text-right">
                      <p className={clsx('text-xs font-bold', expiring?'text-amber-600':'text-slate-500')}>Expires {cert.expiresAt}</p>
                      {expiring && <p className="text-xs text-amber-500">⚠ Renew soon</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Modal>
      )}

      {selVeh && (
        <Modal open title={selVeh.registration} onClose={() => setSelVeh(null)} size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDeleteVeh(selVeh.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { editVeh(selVeh); setSelVeh(null) }}>Edit</Button>
            </div>
          }>
          <div className="grid grid-cols-2 gap-3">
            {[
              {l:'Make/Model',v:`${selVeh.make ?? ''} ${selVeh.model ?? ''}`},{l:'Year',v:selVeh.year},
              {l:'Type',v:selVeh.type},{l:'Status',v:selVeh.status?.replace('_',' ')},
              {l:'Driver',v:selVeh.driverName??'—'},{l:'Odometer',v:`${(selVeh.currentOdometer??0).toLocaleString()} km`},
              {l:'Last Service',v:selVeh.lastServiceDate??'—'},{l:'Next Service',v:selVeh.nextServiceDate??'—'},
            ].map(item=>(
              <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 capitalize">{item.v}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {empModal}
      {vehModal}
      {toolModal}
    </div>
  )
}
