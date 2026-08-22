import { useRef, useState } from 'react'
import { Plus, AlertTriangle, MapPin, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { useEntity } from '@/lib/hooks/useEntity'
import { TABLES } from '@/lib/api/entityConfigs'
import { findBusyCrew, planResourceStatusUpdates } from '@/lib/fieldOps'
import type { SurveyReport, InstallationRecord, IntegrationRecord, SurveyStatus, InstallStatus, Employee, Vehicle } from '@/types/v2'
import { clsx } from 'clsx'

type Tab = 'survey' | 'installation' | 'integration'

const SURVEY_FLOW: { id: SurveyStatus; label: string }[] = [
  { id: 'planned', label: 'Planned' }, { id: 'assigned', label: 'Assigned' },
  { id: 'survey_started', label: 'Started' }, { id: 'survey_completed', label: 'Completed' }, { id: 'approved', label: 'Approved' },
]
const INSTALL_FLOW: { id: InstallStatus; label: string }[] = [
  { id: 'pending', label: 'Pending' }, { id: 'material_delivered', label: 'Material' },
  { id: 'install_started', label: 'Started' }, { id: 'install_completed', label: 'Done' },
  { id: 'quality_check', label: 'QC' }, { id: 'approved', label: 'Approved' },
]
const INTEG_FLOW = [
  { id: 'pending', label: 'Pending' }, { id: 'integration_started', label: 'Started' },
  { id: 'testing', label: 'Testing' }, { id: 'integrated', label: 'Integrated' }, { id: 'accepted', label: 'Accepted' },
]

function Stepper({ steps, current }: { steps: { id: string; label: string }[]; current: string }) {
  const idx = steps.findIndex(s => s.id === current)
  return (
    <div className="flex items-center overflow-x-auto pb-1">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-center flex-shrink-0">
          <div className="flex flex-col items-center gap-1">
            <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
              i < idx  ? 'bg-green-500 text-white' :
              i === idx ? 'bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-900/30' :
                         'bg-slate-200 dark:bg-slate-700 text-slate-400')}>
              {i < idx ? '✓' : i + 1}
            </div>
            <span className={clsx('text-xs whitespace-nowrap', i === idx ? 'text-brand-600 font-bold' : i < idx ? 'text-green-600' : 'text-slate-400')}>{step.label}</span>
          </div>
          {i < steps.length - 1 && <div className={clsx('h-0.5 w-6 mx-1 mb-4', i < idx ? 'bg-green-400' : 'bg-slate-200 dark:bg-slate-700')} />}
        </div>
      ))}
    </div>
  )
}

export function FieldOpsModule() {
  const [tab, setTab] = useState<Tab>('survey')
  // Resource Mgmt rows: resolve crew/vehicle names + flip status on assignment.
  const empRes = useEntity<Employee>(TABLES.employees)
  const vehRes = useEntity<Vehicle>(TABLES.vehicles)

  // Once a crew member/vehicle is attached to a field operation, mark it
  // assigned/in-use so Resource Mgmt no longer shows it as available. When the
  // operation is approved/accepted, release them back to 'available'.
  const syncResources = (terminal: string) => async (_row: unknown, values: Record<string, any>, previous?: any) => {
    const plan = planResourceStatusUpdates(values, previous, terminal)
    await Promise.all([
      ...plan.employeeUpdates.map(({ id, status }) => empRes.update(id, { status })),
      ...plan.vehicleUpdates.map(({ id, status }) => vehRes.update(id, { status })),
    ])
  }

  // Blocking guard (runs before save): a crew member (Team Leader / Technician
  // / Rigger / Driver) still on a NOT-yet-approved field op cannot be assigned
  // to a new one. Managers/inspectors/CEO are not gated.
  const surveysRef = useRef<SurveyReport[]>([])
  const installsRef = useRef<InstallationRecord[]>([])
  const integsRef = useRef<IntegrationRecord[]>([])
  const guardCrew = (values: Record<string, any>, editing: any) => {
    const busy = findBusyCrew(
      { surveys: surveysRef.current, installs: installsRef.current, integs: integsRef.current },
      editing?.id
    )
    const blocked = [values.teamLeaderId, values.technicianId, values.riggerId, values.driverId]
      .filter((id) => id && busy.has(id))
      .map((id) => busy.get(id))
    if (blocked.length) {
      throw new Error(`Cannot assign — crew still on an unfinished field op: ${[...new Set(blocked)].join(' · ')}. Approve it first.`)
    }
    return values
  }

  const { data: surveys, error: survErr, openCreate: newSurvey, openEdit: editSurvey, remove: removeSurvey, modal: surveyModal } = useEntityCrud<SurveyReport>(TABLES.surveyReports, 'Survey', undefined, syncResources('approved'), guardCrew, syncResources('approved'))
  const { data: installs, error: instErr, openCreate: newInstall, openEdit: editInstall, remove: removeInstall, modal: installModal } = useEntityCrud<InstallationRecord>(TABLES.installationRecords, 'Installation Record', undefined, syncResources('approved'), guardCrew, syncResources('approved'))
  const { data: integs, error: integErr, openCreate: newInteg, openEdit: editInteg, remove: removeInteg, modal: integModal } = useEntityCrud<IntegrationRecord>(TABLES.integrationRecords, 'Integration Record', undefined, syncResources('accepted'), guardCrew, syncResources('accepted'))
  surveysRef.current = surveys
  installsRef.current = installs
  integsRef.current = integs
  const [selSurvey, setSelSurvey] = useState<SurveyReport | null>(null)
  const [selInstall, setSelInstall] = useState<InstallationRecord | null>(null)
  const [selInteg, setSelInteg] = useState<IntegrationRecord | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const addForTab = () => tab === 'survey' ? newSurvey() : tab === 'installation' ? newInstall() : newInteg()
  const errorForTab = tab === 'survey' ? survErr : tab === 'installation' ? instErr : integErr

  const handleDeleteSurvey = async (id: string) => {
    if (!confirm('Delete this survey?')) return
    try {
      setActionError(null)
      await removeSurvey(id)
      setSelSurvey(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }
  const handleDeleteInstall = async (id: string) => {
    if (!confirm('Delete this installation record?')) return
    try {
      setActionError(null)
      await removeInstall(id)
      setSelInstall(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }
  const handleDeleteInteg = async (id: string) => {
    if (!confirm('Delete this integration record?')) return
    try {
      setActionError(null)
      await removeInteg(id)
      setSelInteg(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  // ── Crew/vehicle name resolution + display ──────────────────────────────
  const empName = (id?: string) => (id ? (empRes.data.find((e) => e.id === id)?.name ?? id.slice(0, 8)) : null)
  const vehLabel = (id?: string) => {
    const v = vehRes.data.find((x) => x.id === id)
    return v ? [v.registration, v.make, v.model].filter(Boolean).join(' ') : null
  }
  const crewSize = (r: any) => [r.teamLeaderId, r.technicianId, r.riggerId, r.driverId].filter(Boolean).length
  const renderCrew = (r: any) => {
    const crew = (['Team Leader', 'Technician', 'Rigger', 'Driver'] as const)
      .map((label, i) => [label, [r.teamLeaderId, r.technicianId, r.riggerId, r.driverId][i]] as [string, string])
      .filter(([, id]) => id)
    const veh = r.vehicleId ? vehLabel(r.vehicleId) : null
    const pm = r.projectManagerId ? empName(r.projectManagerId) : null
    if (crew.length === 0 && !veh && !pm) return null
    return (
      <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Team & Vehicle</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {pm && <div><p className="text-xs text-slate-400">Project Manager</p><p className="text-sm font-semibold text-slate-900 dark:text-white">{pm}</p></div>}
          {crew.map(([label, id]) => (
            <div key={label}><p className="text-xs text-slate-400">{label}</p><p className="text-sm font-semibold text-slate-900 dark:text-white">{empName(id)}</p></div>
          ))}
          {veh && <div><p className="text-xs text-slate-400">Vehicle</p><p className="text-sm font-semibold text-slate-900 dark:text-white">{veh}</p></div>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: 'Surveys',       v: surveys.length,                                           color: 'text-blue-600' },
          { l: 'Approved',      v: surveys.filter(s => s.status === 'approved').length,       color: 'text-green-600' },
          { l: 'Installations', v: installs.filter(s => s.status === 'approved').length, color: 'text-purple-600' },
          { l: 'Integrated',    v: integs.filter(i => i.status === 'accepted').length,  color: 'text-cyan-600' },
        ].map(s => (
          <Card key={s.l} className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.l}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.v}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {(['survey','installation','integration'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-md capitalize transition-all ${tab===t ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>
              {t}
            </button>
          ))}
        </div>
        <Button icon={<Plus className="w-4 h-4"/>} onClick={addForTab}>New Record</Button>
      </div>
      {errorForTab && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{errorForTab}</div>}
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}

      {/* Survey List */}
      {tab === 'survey' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {surveys.map(sv => (
            <Card key={sv.id} hover padding={false} onClick={() => setSelSurvey(sv)} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div><p className="font-mono text-xs font-bold text-brand-600">{sv.siteCode}</p><p className="font-bold text-slate-900 dark:text-white">{sv.siteName}</p></div>
                <Badge status={sv.status} />
              </div>
              <Stepper steps={SURVEY_FLOW} current={sv.status} />
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs">
                <div><p className="text-slate-400">Tower</p><p className="font-semibold capitalize">{sv.towerType}</p></div>
                <div><p className="text-slate-400">Height</p><p className="font-semibold">{sv.towerHeight}m</p></div>
                <div><p className="text-slate-400">Access</p><p className="font-semibold capitalize">{sv.accessibility}</p></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Installation List */}
      {tab === 'installation' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {installs.map(ins => (
            <Card key={ins.id} hover padding={false} onClick={() => setSelInstall(ins)} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div><p className="text-sm font-bold text-slate-900 dark:text-white">Installation Record</p><p className="text-xs text-slate-500">Site: {ins.siteName || ins.siteCode || ins.siteId}</p></div>
                <Badge status={ins.status} />
              </div>
              <Stepper steps={INSTALL_FLOW} current={ins.status} />
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs">
                <div><p className="text-slate-400">Equipment</p><p className="font-semibold">{(ins.equipmentInstalled??[]).length}</p></div>
                <div><p className="text-slate-400">Punch List</p><p className={clsx('font-semibold', (ins.punchList??[]).filter(p=>p.status==='open').length>0?'text-amber-600':'text-green-600')}>{(ins.punchList??[]).filter(p=>p.status==='open').length} open</p></div>
                <div><p className="text-slate-400">Team</p><p className="font-semibold">{crewSize(ins)}</p></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Integration List */}
      {tab === 'integration' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {integs.map(intg => (
            <Card key={intg.id} hover padding={false} onClick={() => setSelInteg(intg)} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div><p className="text-sm font-bold text-slate-900 dark:text-white">{intg.bbuModel}</p><p className="text-xs text-slate-500">Site: {intg.siteName || intg.siteCode || intg.siteId}</p></div>
                <Badge status={intg.status} />
              </div>
              <Stepper steps={INTEG_FLOW} current={intg.status} />
              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs">
                <div><p className="text-slate-400">VSWR</p><p className={clsx('font-bold', (intg.vswr??99)<=1.5?'text-green-600':'text-red-600')}>{intg.vswr??'—'}</p></div>
                <div><p className="text-slate-400">DL</p><p className="font-bold">{intg.throughputDL ? `${intg.throughputDL}M`:'—'}</p></div>
                <div><p className="text-slate-400">UL</p><p className="font-bold">{intg.throughputUL ? `${intg.throughputUL}M`:'—'}</p></div>
                <div><p className="text-slate-400">ms</p><p className="font-bold">{intg.latency??'—'}</p></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Survey Detail */}
      {selSurvey && (
        <Modal open title={`Survey — ${selSurvey.siteName}`} onClose={() => setSelSurvey(null)} size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDeleteSurvey(selSurvey.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { editSurvey(selSurvey); setSelSurvey(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-4">
            <Stepper steps={SURVEY_FLOW} current={selSurvey.status} />
            {renderCrew(selSurvey)}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {l:'Site Code',v:selSurvey.siteCode},{l:'Scheduled',v:selSurvey.scheduledDate},
                {l:'Project',v:selSurvey.projectName ?? '—'},
                {l:'Tower Type',v:selSurvey.towerType},{l:'Height',v:`${selSurvey.towerHeight}m`},
                {l:'Power',v:selSurvey.powerSource},{l:'Transmission',v:selSurvey.transmissionType?.toUpperCase()},
                {l:'Accessibility',v:selSurvey.accessibility},{l:'Shelter',v:selSurvey.shelterAvailable?'Yes':'No'},
                {l:'Generator',v:selSurvey.generatorAvailable?`Yes (${selSurvey.generatorCapacity})`:'No'},{l:'Engineer',v:selSurvey.engineerSignature??'Pending'},
                {l:'Completed',v:selSurvey.completedAt?.slice(0,10)??'—'},{l:'Approved By',v:selSurvey.approvedBy??'—'},
              ].map(item => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 capitalize">{item.v}</p>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1"><MapPin className="w-3 h-3"/>GPS Coordinates</p>
              <p className="font-mono text-sm text-slate-900 dark:text-white">{selSurvey.latitude?.toFixed?.(6)}°, {selSurvey.longitude?.toFixed?.(6)}°</p>
              <a href={`https://www.google.com/maps?q=${selSurvey.latitude},${selSurvey.longitude}`} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline mt-1 inline-block">Open in Google Maps →</a>
            </div>
            {selSurvey.risks && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <p className="text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-1 mb-1"><AlertTriangle className="w-3 h-3"/>Risks</p>
                <p className="text-sm text-red-700 dark:text-red-300">{selSurvey.risks}</p>
              </div>
            )}
            {selSurvey.recommendations && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">Recommendations</p>
                <p className="text-sm text-amber-700 dark:text-amber-300">{selSurvey.recommendations}</p>
              </div>
            )}
            {selSurvey.comments && <div><p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Comments</p><p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">{selSurvey.comments}</p></div>}
          </div>
        </Modal>
      )}

      {/* Installation Detail */}
      {selInstall && (
        <Modal open title="Installation Record" onClose={() => setSelInstall(null)} size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDeleteInstall(selInstall.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { editInstall(selInstall); setSelInstall(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-4">
            <Stepper steps={INSTALL_FLOW} current={selInstall.status} />
            {renderCrew(selInstall)}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Equipment Installed ({(selInstall.equipmentInstalled??[]).length})</p>
              {(selInstall.equipmentInstalled??[]).map(eq => (
                <div key={eq.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg mb-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <div className="flex-1"><p className="text-sm font-semibold">{eq.brand} {eq.model}</p><p className="text-xs text-slate-500">S/N: {eq.serialNumber} · {eq.position}</p></div>
                  <p className="text-xs text-slate-400">{eq.installedAt.slice(0,10)}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Punch List ({(selInstall.punchList??[]).length})</p>
              {(selInstall.punchList??[]).length === 0 ? <p className="text-sm text-green-600 font-semibold">✓ No punch list items</p>
                : (selInstall.punchList??[]).map(item => (
                  <div key={item.id} className={clsx('flex items-start gap-3 p-3 rounded-lg mb-2', item.status==='resolved'?'bg-green-50 dark:bg-green-900/20':'bg-amber-50 dark:bg-amber-900/20')}>
                    <Badge status={item.severity} className="flex-shrink-0 mt-0.5" />
                    <div className="flex-1"><p className="text-sm font-semibold">{item.description}</p>{item.resolvedBy&&<p className="text-xs text-green-600 mt-0.5">Resolved by {item.resolvedBy} · {item.resolvedAt}</p>}</div>
                    <span className={clsx('text-xs font-bold', item.status==='resolved'?'text-green-600':'text-amber-600')}>{item.status}</span>
                  </div>
                ))
              }
            </div>
            {selInstall.comments && <div><p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Comments</p><p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/30 rounded-lg p-3">{selInstall.comments}</p></div>}
          </div>
        </Modal>
      )}

      {/* Integration Detail */}
      {selInteg && (
        <Modal open title={`Integration — ${selInteg.bbuModel}`} onClose={() => setSelInteg(null)} size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDeleteInteg(selInteg.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { editInteg(selInteg); setSelInteg(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-4">
            <Stepper steps={INTEG_FLOW} current={selInteg.status} />
            {renderCrew(selInteg)}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[{l:'BBU Model',v:selInteg.bbuModel},{l:'BBU Serial',v:selInteg.bbuSerial},{l:'MW Link',v:selInteg.mwLink??'—'},{l:'Frequency',v:selInteg.mwFrequency??'—'},{l:'IP Address',v:selInteg.ipAddress??'—'},{l:'VLAN',v:selInteg.vlanId??'—'}].map(item=>(
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3"><p className="text-xs text-slate-500 font-semibold uppercase">{item.l}</p><p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{item.v}</p></div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[{l:'DL Throughput',v:`${selInteg.throughputDL ?? '—'}Mbps`,good:(selInteg.throughputDL??0)>=150},{l:'UL Throughput',v:`${selInteg.throughputUL ?? '—'}Mbps`,good:(selInteg.throughputUL??0)>=50},{l:'Latency',v:`${selInteg.latency ?? '—'}ms`,good:(selInteg.latency??999)<=20}].map(kpi=>(
                <div key={kpi.l} className={clsx('rounded-lg p-4 text-center',kpi.good?'bg-green-50 dark:bg-green-900/20':'bg-red-50 dark:bg-red-900/20')}>
                  <p className="text-xs text-slate-500 mb-1">{kpi.l}</p><p className={clsx('text-xl font-black',kpi.good?'text-green-600':'text-red-600')}>{kpi.v}</p>
                </div>
              ))}
            </div>
            <div><p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Commissioning Data</p>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(selInteg.commissioningData??{}).map(([k,v])=>(
                  <div key={k} className="bg-slate-50 dark:bg-slate-700/30 rounded-lg p-2.5"><p className="text-xs text-slate-400">{k}</p><p className="text-sm font-bold text-slate-900 dark:text-white">{v}</p></div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {surveyModal}
      {installModal}
      {integModal}
    </div>
  )
}
