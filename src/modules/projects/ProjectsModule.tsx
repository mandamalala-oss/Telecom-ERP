import { useState, useMemo } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { useEntity } from '@/lib/hooks/useEntity'
import { TABLES } from '@/lib/api/entityConfigs'
import { projectFinance } from '@/lib/projectFinance'
import { supabase } from '@/lib/supabase'
import type { Project, PhaseDetail, ProjectSite, Site } from '@/types'

const fmt = (n: number | null | undefined) => {
  const v = n ?? 0
  return v >= 1e6 ? `${(v/1e6).toFixed(1)}M Ar` : `${v.toLocaleString()} Ar`
}

const PHASE_LABELS: Record<string, string> = {
  survey: 'Survey', installation: 'Installation',
  integration: 'Integration', atp: 'ATP', acceptance: 'Acceptance',
}
const PHASES = ['survey','installation','integration','atp','acceptance']

function PhaseTimeline({ phases, currentPhase, progress }: { phases: PhaseDetail[]; currentPhase?: string; progress?: number }) {
  const curIdx = PHASES.indexOf(currentPhase ?? '')
  return (
    <div className="flex items-center gap-0 w-full">
      {PHASES.map((ph, i) => {
        const p = phases.find(x => x.phase === ph)
        // Explicit per-phase records win; otherwise infer the funnel:
        // phases before the current one are completed (full color), the
        // current phase is in progress (filled by `progress`), later
        // phases are pending (empty).
        const status = p?.status ?? (i < curIdx ? 'completed' : i === curIdx ? 'in_progress' : 'pending')
        const pct = p?.completionPct ?? (i === curIdx ? (progress ?? 0) : 0)
        // The selected/current phase gets a colored ring around the number;
        // the ring's fill is proportional to progress — empty at 0%, full at 100%.
        const active = status === 'completed' || status === 'in_progress'
        const color = status === 'completed' ? '#22c55e' : '#3b82f6' // green-500 / brand-500
        const fill = active ? Math.min(100, Math.max(0, status === 'completed' ? 100 : pct)) : 0
        const deg = fill * 3.6
        return (
          <div key={ph} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 transition-all
                  ${active ? '' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-400'}`}
                style={active ? {
                  borderColor: color,
                  color: fill >= 50 ? '#fff' : color,
                  background: `conic-gradient(${color} 0deg, ${color} ${deg}deg, transparent ${deg}deg, transparent 360deg)`,
                } : undefined}
              >
                {status === 'completed' ? '✓' : i + 1}
              </div>
              <p className="text-xs text-slate-500 mt-1 hidden md:block whitespace-nowrap">{PHASE_LABELS[ph]}</p>
              {status === 'in_progress' && (
                <div className="w-full max-w-[60px] bg-slate-200 dark:bg-slate-700 rounded-full h-1 mt-1">
                  <div className="bg-brand-500 h-1 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
            {i < PHASES.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 ${status === 'completed' ? 'bg-green-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ProjectsModule() {
  const { data: sites } = useEntity<Site>(TABLES.sites)
  const { data: projectSites, refresh: refreshProjectSites } = useEntity<ProjectSite>(TABLES.projectSites)

  // Keep the junction table in sync when the form's site selection changes.
  // 1 project = 1 site: `values` carries the virtual `siteId` single-select
  // (stripped from the projects row itself); we rewrite the project_sites rows
  // here, on both create and edit.
  const syncSites = async (row: Project, values: Record<string, any>) => {
    const siteId: string = typeof values.siteId === 'string' ? values.siteId : ''
    const { error: del } = await supabase.from('project_sites').delete().eq('project_id', row.id)
    if (del) throw del
    if (siteId) {
      const { error: ins } = await supabase.from('project_sites').insert({ project_id: row.id, site_id: siteId })
      if (ins) throw ins
    }
    await refreshProjectSites()
  }

  const { data: projects, loading, error, openCreate, openEdit, remove, modal } = useEntityCrud<Project>(
    TABLES.projects, 'Project', undefined, syncSites, undefined, syncSites
  )
  const [selected, setSelected] = useState<Project | null>(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [actionError, setActionError] = useState<string | null>(null)

  const filtered = projects.filter(p => filterStatus === 'all' || p.status === filterStatus)

  const totalBudget  = projects.reduce((s, p) => s + (p.budget ?? 0), 0)
  const totalSpent   = projects.reduce((s, p) => s + (p.spent ?? 0), 0)
  const totalRevenue = projects.reduce((s, p) => s + (p.revenue ?? 0), 0)
  const totalProfit  = projects.reduce((s, p) => s + ((p.revenue ?? 0) - (p.spent ?? 0)), 0)

  // A project covers one or more sites (project_sites junction) — resolve
  // them all per project.
  const sitesByProject = useMemo(() => {
    const siteById = new Map(sites.map(s => [s.id, s]))
    const map = new Map<string, Site[]>()
    for (const ps of projectSites) {
      const site = siteById.get(ps.siteId)
      if (!site) continue
      const list = map.get(ps.projectId) ?? []
      list.push(site)
      map.set(ps.projectId, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.siteId.localeCompare(b.siteId))
    return map
  }, [projectSites, sites])
  const selSites = selected ? sitesByProject.get(selected.id ?? '') ?? [] : []
  const selFin = projectFinance(selected?.budget, selected?.spent, selected?.revenue)

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project?')) return
    try {
      setActionError(null)
      await remove(id)
      setSelected(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { l: 'Total Projects',    v: projects.length,                          color: 'text-blue-600' },
          { l: 'In Progress',       v: projects.filter(p=>p.status==='in_progress').length, color: 'text-amber-600' },
          { l: 'Total BAC',         v: fmt(totalBudget),                         color: 'text-purple-600' },
          { l: 'Total AC',          v: fmt(totalSpent),                          color: 'text-slate-900 dark:text-white' },
          { l: 'Total PO',          v: fmt(totalRevenue),                        color: 'text-green-600' },
          { l: 'Total Profit',      v: fmt(totalProfit),                         color: totalProfit >= 0 ? 'text-green-600' : 'text-red-600' },
        ].map(s => (
          <Card key={s.l} className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.l}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.v}</p>
          </Card>
        ))}
      </div>

      {/* Filters + Actions */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {['all','not_started','in_progress','on_hold','completed'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded capitalize transition-all ${filterStatus===s ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>
              {s.replace('_',' ')}
            </button>
          ))}
        </div>
        <Button icon={<Plus className="w-4 h-4"/>} onClick={openCreate}>New Project</Button>
      </div>
      {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>}
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}
      {loading && <p className="text-xs text-slate-500">Loading…</p>}

      {/* Project Cards */}
      <div className="space-y-4">
        {filtered.map(p => {
          const budgetPct = (p.budget ?? 0) > 0 ? Math.round(((p.spent ?? 0) / (p.budget ?? 0)) * 100) : 0
          const overBudget = budgetPct > 100 || ((p.budget ?? 0) === 0 && (p.spent ?? 0) > 0)
          const sites = sitesByProject.get(p.id ?? '') ?? []
          const fin = projectFinance(p.budget, p.spent, p.revenue)
          return (
            <Card key={p.id} hover padding={false} onClick={() => setSelected(p)}>
              <div className="p-5">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3 mb-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-900 dark:text-white">{p.name}</h3>
                          <Badge status={p.status} />
                          <span className="text-xs font-mono text-slate-400">{sites.length > 0 ? sites.map(s => s.siteId).join(', ') : '—'}</span>
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">{p.customerName} · {p.region}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <PhaseTimeline phases={p.phases ?? []} currentPhase={p.currentPhase} progress={p.progress} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Progress</p>
                      <p className="text-xl font-bold text-brand-600">{p.progress}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">BAC</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{fmt(p.budget)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">AC</p>
                      <p className={`text-sm font-bold ${overBudget ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>{fmt(p.spent)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">PO</p>
                      <p className="text-sm font-bold text-green-600">{fmt(p.revenue)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Sites</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{sites.length}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500">Overall Progress</span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{p.progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${p.progress > 80 ? 'bg-green-500' : 'bg-brand-500'}`}
                      style={{ width: `${p.progress}%` }} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                  <span>Variance: <span className={`font-bold ${fin.varianceColor}`}>{fmt(fin.variance)}</span></span>
                  <span>Profit (excl. tax): <span className={`font-bold ${fin.profitColor}`}>{fmt(fin.profit)}</span></span>
                </div>
                <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
                  <span>PM: <span className="font-semibold text-slate-600 dark:text-slate-300">{(p.pm ?? '—').split(' ')[0]}</span></span>
                  <span>Team: <span className="font-semibold text-slate-600 dark:text-slate-300">{(p.team ?? []).length} members</span></span>
                  <span>Start: <span className="font-semibold text-slate-600 dark:text-slate-300">{p.startDate}</span></span>
                  <span>End: <span className="font-semibold text-slate-600 dark:text-slate-300">{p.endDate}</span></span>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Project Detail Modal */}
      {selected && (
        <Modal open title={selected.name} onClose={() => setSelected(null)} size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(selected.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { openEdit({ ...selected, siteId: selSites[0]?.id ?? '' }); setSelected(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { l: 'Site',      v: selSites.length > 0 ? `${selSites[0].siteId} — ${selSites[0].name}` : '—' },
                { l: 'Customer',  v: selected.customerName },
                { l: 'Region',    v: selected.region },
                { l: 'PM',        v: selected.pm },
                { l: 'Start',     v: selected.startDate },
                { l: 'End',       v: selected.endDate },
                { l: 'BAC',       v: fmt(selected.budget) },
                { l: 'AC',        v: fmt(selected.spent) },
                { l: 'PO',        v: fmt(selected.revenue) },
                { l: 'Variance',  v: <span className={selFin.varianceColor}>{fmt(selFin.variance)}</span> },
                { l: 'Profit (excl. tax)', v: <span className={selFin.profitColor}>{fmt(selFin.profit)}</span> },
              ].map(item => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 break-all">{item.v}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Linked Sites ({selSites.length})</p>
              {selSites.length > 0 ? (
                <div className="space-y-2">
                  {selSites.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{s.name}</p>
                        <p className="text-xs text-slate-500 font-mono">{s.siteId} · {s.status}</p>
                      </div>
                      <p className="text-sm font-bold text-green-600">{fmt(s.revenue)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">No sites linked to this project yet — pick them in the Edit form.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Phase Details</p>
              <div className="space-y-2">
                {(selected.phases ?? []).map(ph => (
                  <div key={ph.phase} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ph.status==='completed' ? 'bg-green-500' : ph.status==='in_progress' ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    <p className="text-sm font-semibold text-slate-900 dark:text-white w-28 capitalize">{PHASE_LABELS[ph.phase]}</p>
                    <Badge status={ph.status} />
                    <div className="flex-1 text-xs text-slate-500">
                      {ph.plannedStart} → {ph.plannedEnd}
                    </div>
                    <div className="flex items-center gap-2 w-28">
                      <div className="flex-1 bg-slate-200 dark:bg-slate-600 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${ph.status==='completed' ? 'bg-green-500' : 'bg-brand-500'}`}
                          style={{ width: `${ph.completionPct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400 w-8">{ph.completionPct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Team</p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs font-semibold rounded-full">👑 {selected.pm}</span>
                {(selected.team ?? []).map(m => (
                  <span key={m} className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-full">👷 {m}</span>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {modal}
    </div>
  )
}
