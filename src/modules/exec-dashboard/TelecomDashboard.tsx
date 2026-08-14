import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { type ReactNode } from 'react'
import {
  FolderKanban, RefreshCw, CheckCircle2, AlertTriangle, Target,
  Ruler, MapPin, Wrench, Radar, CircleDot,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useEntity } from '@/lib/hooks/useEntity'
import { TABLES } from '@/lib/api/entityConfigs'
import type { Project, Site, Invoice, EVMMetrics } from '@/types'
import type { ATPRecord, Subcontractor, Employee, InstallationRecord } from '@/types/v2'
import { clsx } from 'clsx'

const fmt  = (n: number) => (n??0) >= 1e9 ? `${(n/1e9).toFixed(2)}B Ar` : (n??0) >= 1e6 ? `${(n/1e6).toFixed(1)}M Ar` : `${(n??0).toLocaleString()} Ar`
const pct  = (n: number, dec = 1) => `${(n??0).toFixed(dec)}%`

interface KPITileProps {
  label: string; value: string | number; sub?: string
  color: 'blue'|'cyan'|'green'|'amber'|'red'|'orange'|'violet'|'sky'|'emerald'
  icon: ReactNode
  alert?: boolean
}

const COLORS = {
  blue:    { bg:'bg-blue-50 dark:bg-blue-900/20',     txt:'text-blue-700 dark:text-blue-300',     icon:'bg-blue-100 dark:bg-blue-900/40 text-blue-500' },
  cyan:    { bg:'bg-cyan-50 dark:bg-cyan-900/20',     txt:'text-cyan-700 dark:text-cyan-300',     icon:'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-500' },
  green:   { bg:'bg-green-50 dark:bg-green-900/20',   txt:'text-green-700 dark:text-green-300',   icon:'bg-green-100 dark:bg-green-900/40 text-green-500' },
  amber:   { bg:'bg-amber-50 dark:bg-amber-900/20',   txt:'text-amber-700 dark:text-amber-300',   icon:'bg-amber-100 dark:bg-amber-900/40 text-amber-500' },
  red:     { bg:'bg-red-50 dark:bg-red-900/20',       txt:'text-red-700 dark:text-red-300',       icon:'bg-red-100 dark:bg-red-900/40 text-red-500' },
  orange:  { bg:'bg-orange-50 dark:bg-orange-900/20', txt:'text-orange-700 dark:text-orange-300', icon:'bg-orange-100 dark:bg-orange-900/40 text-orange-500' },
  violet:  { bg:'bg-violet-50 dark:bg-violet-900/20', txt:'text-violet-700 dark:text-violet-300', icon:'bg-violet-100 dark:bg-violet-900/40 text-violet-500' },
  sky:     { bg:'bg-sky-50 dark:bg-sky-900/20',       txt:'text-sky-700 dark:text-sky-300',       icon:'bg-sky-100 dark:bg-sky-900/40 text-sky-500' },
  emerald: { bg:'bg-emerald-50 dark:bg-emerald-900/20',txt:'text-emerald-700 dark:text-emerald-300',icon:'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-500' },
}

function KPITile({ label, value, sub, color, icon, alert }: KPITileProps) {
  const c = COLORS[color]
  return (
    <div className={clsx('rounded-xl p-4 border', alert ? 'border-red-300 dark:border-red-700' : 'border-transparent', c.bg)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
          <p className={clsx('text-2xl font-black mt-1', c.txt)}>{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0', c.icon)}>{icon}</div>
      </div>
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-6 bg-brand-600 rounded-full flex-shrink-0" />
      <div>
        <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  )
}

export function TelecomDashboard() {
  const { data: projects, loading: lp } = useEntity<Project>(TABLES.projects)
  const { data: sites, loading: ls } = useEntity<Site>(TABLES.sites)
  const { data: invoices } = useEntity<Invoice>(TABLES.invoices)
  const { data: evm } = useEntity<EVMMetrics>(TABLES.evmMetrics)
  const { data: atpRecords } = useEntity<ATPRecord>(TABLES.atpRecords)
  const { data: subcontractors } = useEntity<Subcontractor>(TABLES.subcontractors)
  const { data: employees } = useEntity<Employee>(TABLES.employees)
  const { data: installs } = useEntity<InstallationRecord>(TABLES.installationRecords)

  if (lp || ls) return <p className="text-xs text-slate-500">Loading…</p>

  const totalRevenue = invoices.reduce((s,i) => s + (i.paid ?? 0), 0)
  const totalCost = evm.reduce((s,e) => s + (e.ac ?? 0), 0)
  const grossMargin = totalRevenue - totalCost
  const grossMarginPct = totalRevenue > 0 ? (grossMargin / totalRevenue) * 100 : 0

  const kpi = {
    totalProjects: projects.length,
    inProgressProjects: projects.filter(p => p.status === 'in_progress').length,
    completedProjects: projects.filter(p => p.status === 'completed').length,
    delayedProjects: projects.filter(p => p.status === 'on_hold').length,
    projectsOnTrack: projects.filter(p => p.status === 'in_progress' && (p.progress ?? 0) >= 50).length,
    sitesPlanned: sites.length,
    sitesSurveyed: sites.filter(s => ['survey','installation','integration','atp','acceptance','live'].includes(s.status)).length,
    sitesInstalled: sites.filter(s => ['installation','integration','atp','acceptance','live'].includes(s.status)).length,
    sitesIntegrated: sites.filter(s => ['integration','atp','acceptance','live'].includes(s.status)).length,
    sitesAccepted: sites.filter(s => ['acceptance','live'].includes(s.status)).length,
    sitesLive: sites.filter(s => s.status === 'live').length,
    totalRevenue,
    totalCost,
    grossMargin,
    grossMarginPct,
    pendingAR: invoices.reduce((s,i) => s + (i.balance ?? 0), 0),
    avgCPI: evm.length ? evm.reduce((s,e) => s + (e.cpi ?? 1), 0) / evm.length : 1,
    avgSPI: evm.length ? evm.reduce((s,e) => s + (e.spi ?? 1), 0) / evm.length : 1,
    totalEAC: evm.reduce((s,e) => s + (e.eac ?? 0), 0),
    totalVAC: evm.reduce((s,e) => s + (e.vac ?? 0), 0),
    atpSuccessRate: atpRecords.length ? Math.round(atpRecords.filter(r => r.overallResult === 'pass').length / atpRecords.length * 100) : 0,
    acceptanceBacklog: atpRecords.filter(r => r.status === 'approved').length,
    resourceUtilisation: employees.length ? Math.round(employees.filter(e => e.status === 'assigned').length / employees.length * 100) : 0,
    openPunchListItems: installs.reduce((s,i) => s + (i.punchList ?? []).filter(p => p.status === 'open').length, 0),
  }

  const siteFunnel = [
    { stage: 'Planned',    count: kpi.sitesPlanned },
    { stage: 'Surveyed',   count: kpi.sitesSurveyed },
    { stage: 'Installed',  count: kpi.sitesInstalled },
    { stage: 'Integrated', count: kpi.sitesIntegrated },
    { stage: 'Accepted',   count: kpi.sitesAccepted },
    { stage: 'Live',       count: kpi.sitesLive },
  ]

  const evmData = evm.map(e => ({ name: (e.projectName??'').split(' ').slice(0,2).join(' '), CPI: e.cpi, SPI: e.spi }))

  const totalEmp = employees.length
  const assignedEmp = employees.filter(e => e.status === 'assigned').length
  const utilPct = totalEmp > 0 ? Math.round(assignedEmp / totalEmp * 100) : 0

  return (
    <div className="space-y-6">
      {/* ── PROJECT KPIs ── */}
      <div>
        <SectionHeader title="Project KPIs" subtitle="Live project status" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <KPITile label="Total Projects"  value={kpi.totalProjects}    icon={<FolderKanban className="w-5 h-5" />}  color="blue"  />
          <KPITile label="In Progress"     value={kpi.inProgressProjects} icon={<RefreshCw className="w-5 h-5" />}    color="cyan"  />
          <KPITile label="Completed"       value={kpi.completedProjects} icon={<CheckCircle2 className="w-5 h-5" />}  color="green" />
          <KPITile label="On Hold"         value={kpi.delayedProjects}  icon={<AlertTriangle className="w-5 h-5" />} color="amber" alert={kpi.delayedProjects>0} />
          <KPITile label="On Track"        value={kpi.projectsOnTrack}  icon={<Target className="w-5 h-5" />}        color="red"   />
        </div>
      </div>

      {/* ── SITE ROLLOUT KPIs ── */}
      <div>
        <SectionHeader title="Site Rollout Funnel" subtitle="Cumulative site progression" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <Card padding={false}>
              <div className="px-5 pt-4 pb-1">
                <p className="text-xs text-slate-500">Total portfolio: {kpi.sitesPlanned} sites</p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={siteFunnel} margin={{top:5,right:20,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-700" />
                  <XAxis dataKey="stage" tick={{fontSize:11}} />
                  <YAxis tick={{fontSize:11}} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} name="Sites" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
          <div className="grid grid-cols-2 gap-3 content-start">
            <KPITile label="Planned"    value={kpi.sitesPlanned}    icon={<Ruler className="w-5 h-5" />}       color="sky"     />
            <KPITile label="Surveyed"   value={kpi.sitesSurveyed}   icon={<MapPin className="w-5 h-5" />}       color="red"     />
            <KPITile label="Installed"  value={kpi.sitesInstalled}  icon={<Wrench className="w-5 h-5" />}       color="orange"  />
            <KPITile label="Integrated" value={kpi.sitesIntegrated} icon={<Radar className="w-5 h-5" />}        color="violet"  />
            <KPITile label="Accepted"   value={kpi.sitesAccepted}   icon={<CheckCircle2 className="w-5 h-5" />} color="green"   />
            <KPITile label="Live"       value={kpi.sitesLive}       icon={<CircleDot className="w-5 h-5" />}    color="emerald" sub="In service" />
          </div>
        </div>
      </div>

      {/* ── FINANCIAL KPIs ── */}
      <div>
        <SectionHeader title="Financial KPIs" subtitle="Revenue, margin, AR" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KPITile label="Revenue"          value={fmt(kpi.totalRevenue)}    icon="💰" color="green"  />
          <KPITile label="Total Cost"       value={fmt(kpi.totalCost)}       icon="💸" color="red"    />
          <KPITile label="Gross Margin"     value={fmt(kpi.grossMargin)}     icon="📊" color={kpi.grossMarginPct>=0?'green':'red'} sub={pct(kpi.grossMarginPct)} alert={kpi.grossMarginPct<0} />
          <KPITile label="Pending A/R"      value={fmt(kpi.pendingAR)}       icon="⏳" color="amber"  />
        </div>
      </div>

      {/* ── EVM PORTFOLIO ── */}
      <div>
        <SectionHeader title="Earned Value (Portfolio)" subtitle="Cost & schedule performance" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="grid grid-cols-2 gap-3 content-start">
            <KPITile label="Avg CPI"  value={kpi.avgCPI.toFixed(3)}   icon="💹" color={kpi.avgCPI>=1?'green':'red'} sub={kpi.avgCPI>=1?'Under budget':'Over budget'} alert={kpi.avgCPI<0.9} />
            <KPITile label="Avg SPI"  value={kpi.avgSPI.toFixed(3)}   icon="📅" color={kpi.avgSPI>=1?'green':'amber'} sub={kpi.avgSPI>=1?'Ahead':'Behind'} alert={kpi.avgSPI<0.85} />
            <KPITile label="Total EAC" value={`${(kpi.totalEAC/1e6).toFixed(0)}M`} icon="🎯" color="blue" />
            <KPITile label="Total VAC" value={`${(kpi.totalVAC/1e6).toFixed(0)}M`} icon="📐" color={kpi.totalVAC>=0?'green':'red'} />
          </div>
          <div className="xl:col-span-2">
            <Card padding={false}>
              <div className="px-5 pt-4 pb-1">
                <p className="text-sm font-bold text-slate-900 dark:text-white">Portfolio CPI & SPI</p>
                <p className="text-xs text-slate-500">Target ≥ 1.00 · All active projects</p>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={evmData} margin={{top:5,right:20,left:0,bottom:30}}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-700" />
                  <XAxis dataKey="name" tick={{fontSize:10}} angle={-15} textAnchor="end" interval={0} />
                  <YAxis domain={[0.7,1.2]} tickFormatter={v=>v.toFixed(2)} tick={{fontSize:10}} />
                  <Tooltip formatter={(v:number) => v.toFixed(3)} />
                  <Legend />
                  <ReferenceLine y={1} stroke="#10b981" strokeDasharray="4 2" />
                  <Bar dataKey="CPI" fill="#3b82f6" radius={[3,3,0,0]} name="CPI" />
                  <Bar dataKey="SPI" fill="#f59e0b" radius={[3,3,0,0]} name="SPI" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </div>
      </div>

      {/* ── OPERATIONS KPIs ── */}
      <div>
        <SectionHeader title="Operations KPIs" subtitle="ATP, resource, quality metrics" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card padding={false}>
            <div className="px-5 pt-4 pb-2">
              <p className="text-sm font-bold text-slate-900 dark:text-white">ATP Performance</p>
              <div className="flex gap-4 mt-1">
                <span className="text-xs"><span className="text-green-600 font-bold">{kpi.atpSuccessRate}%</span> success rate</span>
                <span className="text-xs"><span className={clsx('font-bold', kpi.acceptanceBacklog>0?'text-amber-600':'text-green-600')}>{kpi.acceptanceBacklog}</span> pending acceptance</span>
              </div>
            </div>
            <div className="px-5 pb-4">
              <p className="text-xs text-slate-400">{atpRecords.length} ATP record{atpRecords.length !== 1 ? 's' : ''} on file — see the ATP module for the full pass/fail breakdown.</p>
            </div>
          </Card>

          <Card padding={false}>
            <div className="px-5 pt-4 pb-2">
              <p className="text-sm font-bold text-slate-900 dark:text-white">Resource Utilisation</p>
              <p className="text-xs text-slate-500 mt-0.5">{assignedEmp}/{totalEmp} engineers deployed · {utilPct}%</p>
            </div>
            <div className="px-5 pb-4 space-y-4">
              <div>
                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-4">
                  <div className={clsx('h-4 rounded-full text-xs text-white flex items-center justify-center font-bold transition-all', utilPct>=80?'bg-amber-500':utilPct>=60?'bg-brand-500':'bg-green-500')} style={{width:`${utilPct}%`}}>
                    {utilPct}%
                  </div>
                </div>
                <div className="flex justify-between text-xs text-slate-400 mt-1"><span>0%</span><span>100%</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {employees.map(emp => (
                  <div key={emp.id} className="flex items-center gap-2">
                    <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', emp.status==='assigned'?'bg-blue-500':emp.status==='available'?'bg-green-500':'bg-slate-300')} />
                    <span className="text-xs text-slate-600 dark:text-slate-400 truncate">{(emp.name??'').split(' ')[0]}</span>
                    <span className={clsx('text-xs font-semibold ml-auto capitalize', emp.status==='assigned'?'text-blue-600':emp.status==='available'?'text-green-600':'text-slate-400')}>{emp.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <KPITile label="ATP Success Rate"   value={`${kpi.atpSuccessRate}%`}       icon="✅" color={kpi.atpSuccessRate>=90?'green':'amber'} />
          <KPITile label="Acceptance Backlog" value={kpi.acceptanceBacklog}           icon="📋" color={kpi.acceptanceBacklog>0?'amber':'green'} />
          <KPITile label="Resource Util."     value={`${kpi.resourceUtilisation}%`}  icon="👷" color={kpi.resourceUtilisation>=70?'blue':'amber'} />
          <KPITile label="Open Punch Items"   value={kpi.openPunchListItems}          icon="🔧" color={kpi.openPunchListItems>0?'red':'green'} />
        </div>
      </div>

      {/* ── SUBCONTRACTOR RANKING ── */}
      <div>
        <SectionHeader title="Subcontractor Ranking" subtitle="Performance-based ranking · current period" />
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['Rank','Subcontractor','Specialization','ATP Rate','On-Time','Quality','Safety','Overall','Rating'].map(h=><th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {[...subcontractors].sort((a,b)=>((b.scores as any)?.overallScore??0)-((a.scores as any)?.overallScore??0)).map((sub,idx)=>{
                  const raw: any = sub.scores ?? {}
                  const sc: any = {
                    atpSuccessRate: raw.atpSuccessRate ?? 0,
                    onTimeDelivery: raw.onTimeDelivery ?? 0,
                    qualityScore: raw.qualityScore ?? 0,
                    safetyScore: raw.safetyScore ?? 0,
                    overallScore: raw.overallScore ?? 0,
                    rating: raw.rating ?? 'C',
                  }
                  return (
                  <tr key={sub.id} className="tr-hover">
                    <td className="td">
                      <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-sm font-black', idx===0?'bg-amber-400 text-amber-900':idx===1?'bg-slate-300 text-slate-700':idx===2?'bg-orange-300 text-orange-800':'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300')}>
                        {idx+1}
                      </div>
                    </td>
                    <td className="td font-semibold">{sub.companyName}</td>
                    <td className="td text-xs text-slate-500">{(sub.specializations??[])[0] ?? '—'}</td>
                    <td className="td font-bold text-center">{sc.atpSuccessRate}</td>
                    <td className="td font-bold text-center">{sc.onTimeDelivery}</td>
                    <td className="td font-bold text-center">{sc.qualityScore}</td>
                    <td className="td font-bold text-center">{sc.safetyScore}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                          <div className={clsx('h-1.5 rounded-full', sc.overallScore>=80?'bg-green-500':sc.overallScore>=60?'bg-amber-500':'bg-red-500')} style={{width:`${sc.overallScore}%`}} />
                        </div>
                        <span className="text-sm font-black w-8 text-right">{sc.overallScore}</span>
                      </div>
                    </td>
                    <td className="td">
                      <span className={clsx('text-sm font-black px-2 py-0.5 rounded-lg', ({A:'bg-green-100 text-green-700',B:'bg-blue-100 text-blue-700',C:'bg-amber-100 text-amber-700'} as Record<string,string>)[sc.rating]??'bg-slate-100 text-slate-600')}>
                        {sc.rating}
                      </span>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}
