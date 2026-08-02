import { useState } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { TABLES } from '@/lib/api/entityConfigs'
import type { Project, PhaseDetail } from '@/types'

const fmt = (n: number | null | undefined) => {
  const v = n ?? 0
  return v >= 1e6 ? `${(v/1e6).toFixed(1)}M Ar` : `${v.toLocaleString()} Ar`
}

const PHASE_LABELS: Record<string, string> = {
  survey: 'Survey', installation: 'Installation',
  integration: 'Integration', atp: 'ATP', acceptance: 'Acceptance',
}
const PHASES = ['survey','installation','integration','atp','acceptance']

function PhaseTimeline({ phases }: { phases: PhaseDetail[] }) {
  return (
    <div className="flex items-center gap-0 w-full">
      {PHASES.map((ph, i) => {
        const p = phases.find(x => x.phase === ph)
        const status = p?.status ?? 'pending'
        const pct = p?.completionPct ?? 0
        return (
          <div key={ph} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2
                ${status==='completed' ? 'bg-green-500 border-green-500 text-white'
                : status==='in_progress' ? 'bg-brand-500 border-brand-500 text-white'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-400'}`}>
                {status==='completed' ? '✓' : i+1}
              </div>
              <p className="text-xs text-slate-500 mt-1 hidden md:block whitespace-nowrap">{PHASE_LABELS[ph]}</p>
              {status === 'in_progress' && (
                <div className="w-full max-w-[60px] bg-slate-200 dark:bg-slate-700 rounded-full h-1 mt-1">
                  <div className="bg-brand-500 h-1 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
            {i < PHASES.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 ${
                phases.find(x => x.phase === PHASES[i])?.status === 'completed'
                  ? 'bg-green-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ProjectsModule() {
  const { data: projects, loading, error, openCreate, openEdit, remove, modal } = useEntityCrud<Project>(TABLES.projects, 'Project')
  const [selected, setSelected] = useState<Project | null>(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [actionError, setActionError] = useState<string | null>(null)

  const filtered = projects.filter(p => filterStatus === 'all' || p.status === filterStatus)

  const totalBudget = projects.reduce((s, p) => s + (p.budget ?? 0), 0)
  const totalSpent  = projects.reduce((s, p) => s + (p.spent ?? 0), 0)

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: 'Total Projects',    v: projects.length,                          color: 'text-blue-600' },
          { l: 'In Progress',       v: projects.filter(p=>p.status==='in_progress').length, color: 'text-amber-600' },
          { l: 'Total Budget',      v: fmt(totalBudget),                         color: 'text-purple-600' },
          { l: 'Total Spent',       v: fmt(totalSpent),                          color: 'text-red-600' },
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
                          <span className="text-xs font-mono text-slate-400">{p.code}</span>
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">{p.customerName} · {p.region}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <PhaseTimeline phases={p.phases ?? []} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Progress</p>
                      <p className="text-xl font-bold text-brand-600">{p.progress}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Budget</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{fmt(p.budget)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Spent</p>
                      <p className={`text-sm font-bold ${overBudget ? 'text-red-600' : 'text-slate-900 dark:text-white'}`}>{fmt(p.spent)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Sites</p>
                      <p className="text-xl font-bold text-slate-900 dark:text-white">{(p.siteIds ?? []).length}</p>
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
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { openEdit(selected); setSelected(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { l: 'Code',      v: selected.code },
                { l: 'Customer',  v: selected.customerName },
                { l: 'Region',    v: selected.region },
                { l: 'PM',        v: selected.pm },
                { l: 'Start',     v: selected.startDate },
                { l: 'End',       v: selected.endDate },
                { l: 'Budget',    v: fmt(selected.budget) },
                { l: 'Spent',     v: fmt(selected.spent) },
              ].map(item => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 break-all">{item.v}</p>
                </div>
              ))}
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
