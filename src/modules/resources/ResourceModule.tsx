import { useRef, useState } from 'react'
import { Plus, AlertTriangle, Trash2, Pencil, Upload, Download, LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { useEntity } from '@/lib/hooks/useEntity'
import { TABLES } from '@/lib/api/entityConfigs'
import { parseResourceWorkbook, planResourceImport, buildResourceTemplateBuffer } from '@/lib/resourceImport'
import type { Employee, Vehicle, Tool, SurveyReport, InstallationRecord, IntegrationRecord } from '@/types/v2'
import type { Project } from '@/types'
import { clsx } from 'clsx'

type Tab = 'engineers' | 'vehicles' | 'tools'

const STATUS_COLOR: Record<string, string> = {
  available:'bg-green-100 text-green-700', assigned:'bg-blue-100 text-blue-700',
  on_leave:'bg-amber-100 text-amber-700', sick:'bg-red-100 text-red-700',
  training:'bg-purple-100 text-purple-700', unavailable:'bg-slate-100 text-slate-500',
}

const VEH_STATUS: Record<string, string> = {
  available:'bg-green-100 text-green-700', in_use:'bg-blue-100 text-blue-700',
  maintenance:'bg-amber-100 text-amber-700', breakdown:'bg-red-100 text-red-700',
}

const EMP_ROLES = ['Team Leader', 'Technician', 'Rigger', 'Driver', 'Inspector', 'Manager', 'CEO']
const EMP_STATUSES = ['available', 'assigned', 'on_leave', 'sick', 'training', 'unavailable']

const fmt = (n: number) => `${n.toLocaleString()} Ar`

function isExpiringSoon(date?: string) {
  if (!date) return false
  const d = new Date(date)
  return d > new Date() && d < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
}

export function ResourceModule() {
  const { data: employees, error: empErr, openCreate: newEmp, openEdit: editEmp, remove: removeEmp, create: createEmp, modal: empModal } = useEntityCrud<Employee>(TABLES.employees, 'Employee')
  const { data: vehicles, error: vehErr, openCreate: newVeh, openEdit: editVeh, remove: removeVeh, create: createVeh, modal: vehModal } = useEntityCrud<Vehicle>(TABLES.vehicles, 'Vehicle')
  const { data: tools, error: toolErr, openCreate: newTool, openEdit: editTool, remove: removeTool, modal: toolModal } = useEntityCrud<Tool>(TABLES.tools, 'Tool')
  // Field-op + project data to resolve "where is this resource working now".
  const { data: surveys } = useEntity<SurveyReport>(TABLES.surveyReports)
  const { data: installations } = useEntity<InstallationRecord>(TABLES.installationRecords)
  const { data: integrations } = useEntity<IntegrationRecord>(TABLES.integrationRecords)
  const { data: projects } = useEntity<Project>(TABLES.projects)
  const [tab, setTab] = useState<Tab>('engineers')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selEmp, setSelEmp]     = useState<Employee | null>(null)
  const [selVeh, setSelVeh]     = useState<Vehicle | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; duplicates: string[]; errors: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Excel import ──────────────────────────────────────────────────────────
  const handleImportFile = async (file: File) => {
    setImporting(true)
    try {
      let parsed
      try {
        parsed = parseResourceWorkbook(await file.arrayBuffer())
      } catch (e: any) {
        setImportResult({ created: 0, duplicates: [], errors: [`Couldn't read the Excel file: ${e?.message ?? e}`] })
        return
      }
      const plan = planResourceImport(parsed, { engineers: employees, vehicles })
      const duplicates = [
        ...plan.duplicateEngineers.map((n) => `Engineer "${n}"`),
        ...plan.duplicateVehicles.map((r) => `Vehicle "${r}"`),
      ]
      const createErrors: string[] = []
      let created = 0
      for (const e of plan.engineersToCreate) {
        try {
          await createEmp({
            name: e.name, employeeNumber: e.employeeNumber, role: e.role,
            department: e.department, email: e.email, phone: e.phone,
            skills: e.skills, status: e.status, dailyRate: e.dailyRate ?? 0, joinedAt: e.joinedAt,
          })
          created++
        } catch (err: any) {
          createErrors.push(`Engineer "${e.name}": ${err?.message ?? err}`)
        }
      }
      for (const v of plan.vehiclesToCreate) {
        try {
          await createVeh({
            registration: v.registration, make: v.make, model: v.model, year: v.year,
            type: v.type, driverName: v.driverName, currentOdometer: v.currentOdometer ?? 0,
            fuelType: v.fuelType, status: v.status, notes: v.notes,
          })
          created++
        } catch (err: any) {
          createErrors.push(`Vehicle "${v.registration}": ${err?.message ?? err}`)
        }
      }
      setImportResult({ created, duplicates, errors: [...parsed.errors, ...createErrors] })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const downloadTemplate = () => {
    const blob = new Blob([buildResourceTemplateBuffer()], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'resource_import_template.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const available   = employees.filter(e => e.status === 'available').length
  const vehAvail    = vehicles.filter(v => v.status === 'available').length
  const toolsCalib  = tools.filter(t => isExpiringSoon(t.nextCalibration)).length
  const filteredEmployees = employees.filter(e =>
    (!roleFilter || e.role === roleFilter) &&
    (!statusFilter || e.status === statusFilter)
  )

  const addForTab = () => tab === 'engineers' ? newEmp() : tab === 'vehicles' ? newVeh() : newTool()
  const errorForTab = tab === 'engineers' ? empErr : tab === 'vehicles' ? vehErr : toolErr
  const handleDeleteEmp = async (id: string) => { if (confirm('Delete this employee?')) { await removeEmp(id); setSelEmp(null) } }
  const handleDeleteVeh = async (id: string) => { if (confirm('Delete this vehicle?')) { await removeVeh(id); setSelVeh(null) } }

  // Where is this employee working right now? Crew roles (Team Leader /
  // Technician / Rigger / Driver) and the Project Manager are linked to field
  // ops by id; managers / inspectors / CEO are also matched by name on the
  // projects they run. Only in-progress work is shown (terminal statuses are
  // filtered out).
  const assignmentsFor = (emp: Employee) => {
    const ops: { type: string; role: string; siteCode: string; siteName?: string; projectName?: string; status: string }[] = []
    const collect = (type: string, terminal: string, rows: any[]) => {
      for (const r of rows) {
        if (r.status === terminal) continue
        const role = r.projectManagerId === emp.id ? 'Project Manager'
          : r.teamLeaderId === emp.id ? 'Team Leader'
          : r.technicianId === emp.id ? 'Technician'
          : r.riggerId === emp.id ? 'Rigger'
          : r.driverId === emp.id ? 'Driver'
          : null
        if (!role) continue
        ops.push({ type, role, siteCode: r.siteCode ?? '', siteName: r.siteName, projectName: r.projectName, status: r.status })
      }
    }
    collect('Survey', 'approved', surveys)
    collect('Installation', 'approved', installations)
    collect('Integration', 'accepted', integrations)
    const projectsManaged = projects.filter(p =>
      (p.pm === emp.name || (p.team ?? []).includes(emp.name)) && !['completed', 'cancelled'].includes(p.status)
    )
    return { ops, projectsManaged }
  }
  const selAssignments = selEmp ? assignmentsFor(selEmp) : null

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
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Download className="w-4 h-4" />} onClick={downloadTemplate}>Template</Button>
          <Button variant="secondary" icon={<Upload className="w-4 h-4" />} onClick={() => fileRef.current?.click()} disabled={importing}>{importing ? 'Importing…' : 'Import Excel'}</Button>
          <Button icon={<Plus className="w-4 h-4"/>} onClick={addForTab}>Add {tab.slice(0,-1)}</Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f) }}
        />
      </div>
      {errorForTab && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{errorForTab}</div>}

      {/* Engineers */}
      {tab === 'engineers' && (
        <>
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-44">
                <select className="select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
                  <option value="">All roles</option>
                  {EMP_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="w-40">
                <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
                  <option value="">All statuses</option>
                  {EMP_STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                </select>
              </div>
              {(roleFilter || statusFilter) && (
                <button onClick={() => { setRoleFilter(''); setStatusFilter('') }} className="text-xs font-semibold text-brand-600 hover:underline">Clear</button>
              )}
            </div>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button onClick={() => setView('grid')} aria-label="Grid view"
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1 transition-all ${view==='grid'?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500'}`}>
                <LayoutGrid className="w-3.5 h-3.5" /> Grid
              </button>
              <button onClick={() => setView('list')} aria-label="List view"
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1 transition-all ${view==='list'?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500'}`}>
                <List className="w-3.5 h-3.5" /> List
              </button>
            </div>
          </div>

          {filteredEmployees.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">No resources match the selected filters.</p>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredEmployees.map(emp => {
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
                          <p className="text-xs text-slate-500">{emp.role}</p>
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
          ) : (
            <Card padding={false}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr>
                    {['Name','Role','Department','Status','Phone','Email','Daily Rate',''].map(h => <th key={h} className="th">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {filteredEmployees.map(emp => (
                      <tr key={emp.id} className="tr-hover cursor-pointer" onClick={() => setSelEmp(emp)}>
                        <td className="td font-semibold whitespace-nowrap">{emp.name}</td>
                        <td className="td text-xs">{emp.role}</td>
                        <td className="td text-xs text-slate-500">{emp.department ?? '—'}</td>
                        <td className="td">
                          <span className={clsx('text-xs px-2 py-0.5 rounded-full font-bold capitalize', STATUS_COLOR[emp.status])}>{emp.status.replace('_',' ')}</span>
                        </td>
                        <td className="td text-xs whitespace-nowrap">{emp.phone ?? '—'}</td>
                        <td className="td text-xs">{(emp.email ?? '').toLowerCase() || '—'}</td>
                        <td className="td text-xs whitespace-nowrap">{fmt(emp.dailyRate)}</td>
                        <td className="td whitespace-nowrap">
                          <div className="flex gap-1">
                            <button onClick={(e) => { e.stopPropagation(); editEmp(emp) }} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={(e) => { e.stopPropagation(); if (confirm('Delete this employee?')) removeEmp(emp.id!) }} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
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
                {l:'Employee #',v:selEmp.employeeNumber},{l:'Role',v:selEmp.role},
                {l:'Department',v:selEmp.department},{l:'Status',v:selEmp.status?.replace('_',' ')},
                {l:'Email',v:(selEmp.email ?? '').toLowerCase() || '—'},{l:'Phone',v:selEmp.phone},
                {l:'Daily Rate',v:fmt(selEmp.dailyRate)},{l:'Joined',v:selEmp.joinedAt},
              ].map(item=>(
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className={clsx('text-sm font-bold text-slate-900 dark:text-white mt-0.5 break-all', item.l !== 'Email' && 'capitalize')}>{item.v}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Current assignments</p>
              {selAssignments && selAssignments.ops.length === 0 && selAssignments.projectsManaged.length === 0 ? (
                <p className="text-sm text-slate-400">Not assigned to any in-progress work.</p>
              ) : (
                <div className="space-y-2">
                  {selAssignments?.ops.map((op, i) => (
                    <div key={`op-${i}`} className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          <span className="font-mono text-brand-600">{op.siteCode}</span>{op.siteName ? ` — ${op.siteName}` : ''}
                        </p>
                        <p className="text-xs text-slate-500">{op.projectName ?? 'No project'} · {op.type} · {op.role}</p>
                      </div>
                      <span className="text-xs font-semibold text-slate-500 capitalize flex-shrink-0">{op.status.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                  {selAssignments?.projectsManaged.map((p, i) => (
                    <div key={`p-${i}`} className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{p.name}</p>
                        <p className="text-xs text-slate-500">Project · {p.status?.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

      {importResult && (
        <Modal open onClose={() => setImportResult(null)} title="Import result" size="lg"
          footer={
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setImportResult(null)}>Close</Button>
            </div>
          }>
          <div className="space-y-3">
            <p className="text-sm font-bold text-green-600">Created {importResult.created} resource{importResult.created === 1 ? '' : 's'}.</p>
            {importResult.duplicates.length > 0 && (
              <div>
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">Already exists — skipped ({importResult.duplicates.length})</p>
                <ul className="text-xs text-slate-600 dark:text-slate-300 list-disc pl-4 space-y-0.5">
                  {importResult.duplicates.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}
            {importResult.errors.length > 0 && (
              <div>
                <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-1">Skipped — errors ({importResult.errors.length})</p>
                <ul className="text-xs text-red-500 list-disc pl-4 space-y-0.5">
                  {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            {importResult.duplicates.length === 0 && importResult.errors.length === 0 && (
              <p className="text-sm text-slate-500">No duplicates or errors.</p>
            )}
          </div>
        </Modal>
      )}

      {empModal}
      {vehModal}
      {toolModal}
    </div>
  )
}
