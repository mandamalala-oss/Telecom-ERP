import { useState } from 'react'
import { Plus, TrendingUp, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { TABLES } from '@/lib/api/entityConfigs'
import type { Lead, Opportunity, OpportunityStage } from '@/types'

const fmt = (n: number | null | undefined) => {
  const v = n ?? 0
  return v >= 1e6 ? `${(v/1e6).toFixed(1)}M Ar` : `${v.toLocaleString()} Ar`
}

const STAGES: { id: OpportunityStage; label: string; color: string }[] = [
  { id: 'prospecting', label: 'Prospecting',  color: 'bg-slate-200 dark:bg-slate-700' },
  { id: 'proposal',    label: 'Proposal',     color: 'bg-blue-100 dark:bg-blue-900/30' },
  { id: 'negotiation', label: 'Negotiation',  color: 'bg-amber-100 dark:bg-amber-900/30' },
  { id: 'closed_won',  label: 'Closed Won',   color: 'bg-green-100 dark:bg-green-900/30' },
  { id: 'closed_lost', label: 'Closed Lost',  color: 'bg-red-100 dark:bg-red-900/30' },
]

type Tab = 'pipeline' | 'leads' | 'opportunities'

export function CRMModule() {
  const [tab, setTab] = useState<Tab>('pipeline')
  const { data: leads, error: leadsError, openCreate: openCreateLead, openEdit: openEditLead, remove: removeLead, modal: leadModal } = useEntityCrud<Lead>(TABLES.leads, 'Lead')
  const { data: opps, error: oppsError, openCreate: openCreateOpp, openEdit: openEditOpp, remove: removeOpp, modal: oppModal } = useEntityCrud<Opportunity>(TABLES.opportunities, 'Opportunity')
  const [selected, setSelected] = useState<Opportunity | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleDeleteOpp = async (id: string) => {
    if (!confirm('Delete this opportunity?')) return
    try {
      setActionError(null)
      await removeOpp(id)
      setSelected(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }
  const handleDeleteLead = async (id: string) => {
    if (!confirm('Delete this lead?')) return
    try {
      setActionError(null)
      await removeLead(id)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  const totalPipeline = opps.filter(o => !['closed_won','closed_lost'].includes(o.stage))
    .reduce((s, o) => s + o.value * o.probability / 100, 0)
  const totalWon = opps.filter(o => o.stage === 'closed_won').reduce((s, o) => s + o.value, 0)

  return (
    <div className="space-y-5">
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Leads',        value: leads.length,           sub: `${leads.filter(l=>l.status==='qualified').length} qualified`, color: 'text-blue-600' },
          { label: 'Open Opportunities', value: opps.filter(o=>!['closed_won','closed_lost'].includes(o.stage)).length, sub: 'active', color: 'text-amber-600' },
          { label: 'Weighted Pipeline',  value: fmt(totalPipeline),     sub: 'expected value',                 color: 'text-purple-600' },
          { label: 'Closed Won',         value: fmt(totalWon),          sub: `${opps.filter(o=>o.stage==='closed_won').length} deals`,  color: 'text-green-600' },
        ].map(s => (
          <Card key={s.label} className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
        {(['pipeline','leads','opportunities'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md capitalize transition-all ${tab===t ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'pipeline' && (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
          {STAGES.map(stage => {
            const stageOpps = opps.filter(o => o.stage === stage.id)
            const total = stageOpps.reduce((s, o) => s + o.value, 0)
            return (
              <div key={stage.id} className="space-y-2">
                <div className={`rounded-lg px-3 py-2 ${stage.color}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{stage.label}</p>
                    <span className="text-xs bg-white/60 dark:bg-slate-900/40 px-1.5 py-0.5 rounded-full font-semibold">{stageOpps.length}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{fmt(total)}</p>
                </div>
                {stageOpps.map(opp => (
                  <Card key={opp.id} hover padding={false} onClick={() => setSelected(opp)}
                    className="p-3 space-y-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">{opp.name}</p>
                    <p className="text-xs text-slate-500">{opp.customerName}</p>
                    <div className="flex flex-wrap gap-1">
                      {(opp.technologies ?? []).map(t => <Badge key={t} status={t}>{t}</Badge>)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-green-600">{fmt(opp.value)}</span>
                      <span className="text-xs text-slate-400">{opp.probability}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1">
                      <div className="bg-brand-500 h-1 rounded-full" style={{ width: `${opp.probability}%` }} />
                    </div>
                    <p className="text-xs text-slate-400">Close: {opp.expectedClose}</p>
                  </Card>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'leads' && (
        <div className="space-y-4">
          {leadsError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{leadsError}</div>}
          <div className="flex justify-end">
            <Button icon={<Plus className="w-4 h-4"/>} onClick={openCreateLead}>New Lead</Button>
          </div>
          <Card padding={false}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  {['Company','Contact','Value','Source','Status','Assigned To','Created',''].map(h => <th key={h} className="th">{h}</th>)}
                </tr></thead>
                <tbody>
                  {leads.map(l => (
                    <tr key={l.id} className="tr-hover">
                      <td className="td font-semibold text-slate-900 dark:text-white">{l.company}</td>
                      <td className="td">
                        <p className="font-medium">{l.contact}</p>
                        <p className="text-xs text-slate-400">{l.email}</p>
                      </td>
                      <td className="td font-bold text-green-600">{fmt(l.value)}</td>
                      <td className="td capitalize"><Badge status="sent">{l.source?.replace('_',' ')}</Badge></td>
                      <td className="td"><Badge status={l.status} /></td>
                      <td className="td text-slate-500 text-xs">{l.assignedTo}</td>
                      <td className="td text-slate-400 text-xs">{l.createdAt}</td>
                      <td className="td whitespace-nowrap">
                        <div className="flex gap-1">
                          <button onClick={() => openEditLead(l)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteLead(l.id!)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'opportunities' && (
        <div className="space-y-4">
        {oppsError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{oppsError}</div>}
        <div className="flex justify-end">
          <Button icon={<Plus className="w-4 h-4"/>} onClick={openCreateOpp}>New Opportunity</Button>
        </div>
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['Opportunity','Customer','Value','Probability','Sites','Stage','Expected Close'].map(h => <th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {opps.map(o => (
                  <tr key={o.id} className="tr-hover cursor-pointer" onClick={() => setSelected(o)}>
                    <td className="td font-semibold text-brand-600 dark:text-brand-400">{o.name}</td>
                    <td className="td">{o.customerName}</td>
                    <td className="td font-bold text-green-600">{fmt(o.value)}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                          <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${o.probability}%` }} />
                        </div>
                        <span className="text-xs font-semibold">{o.probability}%</span>
                      </div>
                    </td>
                    <td className="td">{o.siteCount}</td>
                    <td className="td"><Badge status={o.stage} /></td>
                    <td className="td text-slate-500">{o.expectedClose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        </div>
      )}

      {/* Opportunity Detail Modal */}
      {selected && (
        <Modal open title={selected.name} onClose={() => setSelected(null)} size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDeleteOpp(selected.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { openEditOpp(selected); setSelected(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { l: 'Customer',       v: selected.customerName },
                { l: 'Value',          v: fmt(selected.value) },
                { l: 'Probability',    v: `${selected.probability}%` },
                { l: 'Expected Close', v: selected.expectedClose },
                { l: 'Sites',          v: `${selected.siteCount} sites` },
                { l: 'Assigned',       v: selected.assignedTo },
              ].map(item => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{item.v}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Technologies</p>
              <div className="flex flex-wrap gap-1.5">
                {selected.technologies.map(t => <Badge key={t} status={t}>{t}</Badge>)}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Stage</p>
              <div className="flex items-center gap-2 flex-wrap">
                {STAGES.map((st, i) => {
                  const idx = STAGES.findIndex(s => s.id === selected.stage)
                  const done = i <= idx
                  return (
                    <div key={st.id} className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-brand-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>{i+1}</div>
                      <span className={`text-xs font-semibold ${done ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>{st.label}</span>
                      {i < STAGES.length - 1 && <TrendingUp className="w-3 h-3 text-slate-300" />}
                    </div>
                  )
                })}
              </div>
            </div>
            {selected.notes && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">{selected.notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {leadModal}
      {oppModal}
    </div>
  )
}
