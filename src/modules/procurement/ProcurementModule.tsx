import { useMemo, useState } from 'react'
import { Plus, ChevronRight, Trash2, Pencil, Search, AlertTriangle, Clock3, PackageCheck, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { TABLES, FIELD_CONFIGS } from '@/lib/api/entityConfigs'
import type { PurchaseRequest } from '@/types/v2'
import { clsx } from 'clsx'
import { useAuth } from '@/contexts/AuthContext'

const fmt = (n: number) => `${n.toLocaleString()} Ar`

const URGENCY_COLOR = { normal:'bg-slate-100 text-slate-600', urgent:'bg-amber-100 text-amber-700', critical:'bg-red-100 text-red-700' }
// Status changes happen ONLY through the module's approve/reject buttons — keep
// status & approval audit fields out of the generic edit form.
const PR_FORM_FIELDS = (FIELD_CONFIGS[TABLES.purchaseRequests] ?? []).filter(f => !['status','approvedBy','approvedAt','rejectionReason'].includes(f.key))
const PR_FLOW = ['draft','pending_approval','approved','po_raised','rejected','cancelled']
const isOverdue = (date?: string) => Boolean(date && new Date(`${date}T23:59:59`) < new Date())

export function ProcurementModule() {
  const { user } = useAuth()
  const { data: prs, loading, error, openCreate, openEdit, remove, update, modal } = useEntityCrud<PurchaseRequest>(TABLES.purchaseRequests, 'Purchase Request', PR_FORM_FIELDS)
  const [tab, setTab] = useState<'overview'|'requests'|'compare'>('overview')
  const [selPR, setSelPR] = useState<PurchaseRequest | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [urgencyFilter, setUrgencyFilter] = useState('all')

  const pending  = prs.filter(p => p.status === 'pending_approval').length
  const approved = prs.filter(p => p.status === 'approved' || p.status === 'po_raised').length
  const total    = prs.reduce((s,p) => s + (p.totalEstimated ?? 0), 0)
  const overdue = prs.filter(p => !['rejected', 'cancelled', 'po_raised'].includes(p.status) && isOverdue(p.requiredBy))
  const sourcingReady = prs.filter(p => p.status === 'approved' && (p.items ?? []).length > 0)
  const sites = [...new Set(prs.map(p => p.projectName).filter(Boolean))] as string[]
  const filtered = useMemo(() => prs.filter(pr => {
    const haystack = `${pr.prNumber} ${pr.projectName ?? ''} ${pr.requestedByName ?? ''} ${(pr.items ?? []).map(i => `${i.description} ${i.partNumber ?? ''}`).join(' ')}`.toLowerCase()
    return (!query || haystack.includes(query.toLowerCase())) &&
      (statusFilter === 'all' || pr.status === statusFilter) &&
      (urgencyFilter === 'all' || pr.urgency === urgencyFilter)
  }), [prs, query, statusFilter, urgencyFilter])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this PR?')) return
    try {
      setActionError(null)
      await remove(id)
      setSelPR(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }
  const approve = async (id: string) => {
    try {
      setActionError(null)
      await update(id, { status: 'approved', approvedBy: user?.name ?? 'Unknown', approvedAt: new Date().toISOString() } as Partial<PurchaseRequest>)
      setSelPR(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }
  const reject = async (id: string) => {
    const rejectionReason = window.prompt('Rejection reason')
    if (rejectionReason === null) return
    try {
      setActionError(null)
      await update(id, { status: 'rejected', approvedBy: user?.name ?? 'Unknown', approvedAt: new Date().toISOString(), rejectionReason } as Partial<PurchaseRequest>)
      setSelPR(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
          { l:'Total PRs',         v:prs.length, color:'text-blue-600' },
          { l:'Pending Approval',  v:pending,          color:pending>0?'text-amber-600':'text-green-600' },
          { l:'Approved',          v:approved,         color:'text-green-600' },
          { l:'Total Estimated',   v:`${(total/1e6).toFixed(1)}M Ar`, color:'text-purple-600' },
          ].map(s => (
          <Card key={s.l} className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.l}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.v}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 border-l-4 border-l-red-500"><div className="flex items-center gap-3"><AlertTriangle className="text-red-500 w-5 h-5" /><div><p className="text-xs font-semibold text-slate-500 uppercase">At-risk deliveries</p><p className="text-xl font-bold text-slate-900 dark:text-white">{overdue.length}</p></div></div><p className="text-xs text-slate-500 mt-2">Required dates passed and not closed</p></Card>
        <Card className="p-4 border-l-4 border-l-amber-500"><div className="flex items-center gap-3"><Clock3 className="text-amber-500 w-5 h-5" /><div><p className="text-xs font-semibold text-slate-500 uppercase">Critical requests</p><p className="text-xl font-bold text-slate-900 dark:text-white">{prs.filter(p => p.urgency === 'critical' && !['rejected','cancelled'].includes(p.status)).length}</p></div></div><p className="text-xs text-slate-500 mt-2">Prioritize network outage and site blockers</p></Card>
        <Card className="p-4 border-l-4 border-l-green-500"><div className="flex items-center gap-3"><PackageCheck className="text-green-500 w-5 h-5" /><div><p className="text-xs font-semibold text-slate-500 uppercase">Ready for sourcing</p><p className="text-xl font-bold text-slate-900 dark:text-white">{sourcingReady.length}</p></div></div><p className="text-xs text-slate-500 mt-2">Approved PRs with item specifications</p></Card>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {(['overview','requests','compare'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-md capitalize transition-all ${tab===t?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500'}`}>
               {t === 'compare' ? 'Quotation Comparison' : t === 'overview' ? 'Control Tower' : 'Purchase Requests'}
            </button>
          ))}
        </div>
        <Button icon={<Plus className="w-4 h-4"/>} onClick={openCreate}>New PR</Button>
      </div>
      {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>}
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}
      {loading && <p className="text-xs text-slate-500">Loading…</p>}

      {tab === 'overview' && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-5"><h3 className="font-bold text-slate-900 dark:text-white">Telecom sourcing queue</h3><p className="text-sm text-slate-500 mt-1">Approved demand requiring vendor action.</p><div className="mt-4 space-y-2">{sourcingReady.slice(0, 5).map(pr => <button key={pr.id} onClick={() => setSelPR(pr)} className="w-full flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-left hover:bg-slate-100 dark:hover:bg-slate-700"><span><span className="font-mono text-xs text-brand-600">{pr.prNumber}</span><span className="block text-sm font-semibold">{pr.projectName ?? 'Unassigned project'}</span></span><span className="text-xs font-bold text-brand-600">{fmt(pr.totalEstimated)}</span></button>)}{sourcingReady.length === 0 && <p className="text-sm text-slate-400 py-4">No approved requests are ready for sourcing.</p>}</div></Card>
          <Card className="p-5"><h3 className="font-bold text-slate-900 dark:text-white">Delivery risk by project</h3><p className="text-sm text-slate-500 mt-1">Overdue demand needs escalation before site deployment.</p><div className="mt-4 space-y-2">{overdue.slice(0, 5).map(pr => <button key={pr.id} onClick={() => setSelPR(pr)} className="w-full flex items-center justify-between rounded-lg border border-red-100 dark:border-red-900/40 p-3 text-left"><span><span className="font-mono text-xs text-red-600">{pr.prNumber}</span><span className="block text-sm font-semibold">{pr.projectName ?? 'Unassigned project'}</span></span><span className="text-xs font-bold text-red-600">{pr.requiredBy}</span></button>)}{overdue.length === 0 && <p className="text-sm text-green-600 py-4">No overdue procurement commitments.</p>}</div></Card>
        </div>
      )}

      {tab === 'requests' && (
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><input aria-label="Search purchase requests" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search PR, part number, project or requester" className="input pl-9" /></div><select aria-label="Filter status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select md:w-48"><option value="all">All statuses</option>{PR_FLOW.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}</select><select aria-label="Filter urgency" value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)} className="select md:w-40"><option value="all">All urgency</option><option value="normal">Normal</option><option value="urgent">Urgent</option><option value="critical">Critical</option></select>{(query || statusFilter !== 'all' || urgencyFilter !== 'all') && <Button variant="secondary" icon={<X className="w-4 h-4" />} onClick={() => { setQuery(''); setStatusFilter('all'); setUrgencyFilter('all') }}>Clear</Button>}</div>
          <p className="text-xs text-slate-500">Showing {filtered.length} of {prs.length} requests {sites.length > 0 ? `across ${sites.length} projects` : ''}</p>
          {filtered.map(pr => {
            const stageIdx = PR_FLOW.indexOf(pr.status)
            return (
              <Card key={pr.id} hover padding={false} onClick={() => setSelPR(pr)} className="p-4">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-mono text-xs font-bold text-brand-600">{pr.prNumber}</p>
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-bold uppercase', URGENCY_COLOR[pr.urgency])}>{pr.urgency}</span>
                      <Badge status={pr.status} />
                    </div>
                     <p className="font-bold text-slate-900 dark:text-white">{(pr.items??[])[0]?.description ?? pr.prNumber}</p>
                    {(pr.items??[]).length > 1 && <p className="text-xs text-slate-400">+{(pr.items??[]).length-1} more items</p>}
                     <p className="text-xs text-slate-500 mt-1">Requested by {pr.requestedByName} · {pr.projectName ?? 'No project'}{pr.siteId ? ` · Site ${pr.siteId}` : ''}</p>
                     {isOverdue(pr.requiredBy) && !['rejected','cancelled','po_raised'].includes(pr.status) && <p className="text-xs font-bold text-red-600 mt-1">Delivery date exceeded</p>}
                  </div>
                  <div className="flex items-center gap-6 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Estimated</p>
                      <p className="font-bold text-slate-900 dark:text-white">{fmt(pr.totalEstimated)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Required By</p>
                      <p className="font-bold text-slate-900 dark:text-white">{pr.requiredBy}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
                {/* Mini workflow */}
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center gap-1">
                  {PR_FLOW.map((st, i) => {
                    const terminal = pr.status === 'rejected' || pr.status === 'cancelled'
                    const isTerminalStep = terminal && st === pr.status
                    return (
                      <div key={st} className="flex items-center gap-1 flex-shrink-0">
                        <div className={clsx('h-1.5 rounded-full transition-all', isTerminalStep ? 'bg-red-500' : i <= stageIdx ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-700', i === 0 ? 'w-8' : 'w-16')} />
                        <span className={clsx('text-xs font-semibold whitespace-nowrap', isTerminalStep ? 'text-red-600' : i <= stageIdx ? 'text-brand-600' : 'text-slate-400')}>{st.replace('_',' ')}</span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )
          })}
          {filtered.length === 0 && <Card className="p-8 text-center text-slate-400">No purchase requests match these filters.</Card>}
        </div>
      )}

      {tab === 'compare' && (
        <Card className="p-8 text-center text-slate-400">
          <p className="text-4xl mb-3">📊</p>
          <p className="font-bold text-slate-600 dark:text-slate-400">Quotation Comparison</p>
          <p className="text-sm mt-1">Issue an RFQ from an approved PR to start comparing vendor quotations.</p>
          <Button className="mt-4" variant="secondary" disabled title="RFQ flow not implemented yet">Issue RFQ</Button>
        </Card>
      )}

      {/* PR Detail Modal */}
      {selPR && (
        <Modal open title={`PR ${selPR.prNumber}`} onClose={() => setSelPR(null)} size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(selPR.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { openEdit(selPR); setSelPR(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {l:'Requested By', v:selPR.requestedByName},
                {l:'Project',      v:selPR.projectName??'—'},
                {l:'Urgency',      v:selPR.urgency},
                {l:'Required By',  v:selPR.requiredBy},
                {l:'Status',       v:selPR.status?.replace('_',' ')},
                {l:'Approved By',  v:selPR.approvedBy??'Pending'},
                {l:'Approved At',  v:selPR.approvedAt??'—'},
                {l:'Created',      v:selPR.createdAt},
              ].map(item=>(
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 capitalize">{item.v}</p>
                </div>
              ))}
            </div>
            {selPR.justification && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">Justification</p>
                <p className="text-sm text-blue-700 dark:text-blue-300">{selPR.justification}</p>
              </div>
            )}
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>{['Description','Part #','Unit','Qty','Est Unit Cost','Est Total'].map(h=><th key={h} className="th">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {(selPR.items??[]).map(item=>(
                    <tr key={item.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="td font-semibold">{item.description}</td>
                      <td className="td font-mono text-xs text-slate-400">{item.partNumber??'—'}</td>
                      <td className="td text-xs">{item.unit}</td>
                      <td className="td font-bold text-center">{item.quantityRequested}</td>
                      <td className="td text-xs">{fmt(item.estimatedUnitCost)}</td>
                      <td className="td font-bold text-brand-600">{fmt(item.estimatedTotal)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
                    <td colSpan={5} className="td font-black text-right">Total Estimated</td>
                    <td className="td font-black text-brand-600 text-lg">{fmt(selPR.totalEstimated)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {selPR.status === 'pending_approval' && (
              <div className="flex gap-3 justify-end">
                <Button variant="danger" onClick={() => reject(selPR.id!)}>Reject</Button>
                <Button onClick={() => approve(selPR.id!)}>Approve PR</Button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {modal}
    </div>
  )
}
