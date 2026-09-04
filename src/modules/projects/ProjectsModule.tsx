import { useState, useMemo, useCallback, useEffect } from 'react'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { useEntity } from '@/lib/hooks/useEntity'
import { useSupplyItems, supplyTotals } from '@/lib/hooks/useSupplyItems'
import { TABLES } from '@/lib/api/entityConfigs'
import { projectFinance } from '@/lib/projectFinance'
import { supabase } from '@/lib/supabase'
import type { Project, PhaseDetail, ProjectSite, Site, SupplyItem, ProjectType, DeliveryStatus, Region, Quote, Company, Contact } from '@/types'

const fmt = (n: number | null | undefined) => {
  // Always the exact amount — never abbreviated (e.g. "3.3M Ar").
  const v = n ?? 0
  return `${v.toLocaleString()} Ar`
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

const isSupply = (p: Project) => (p.projectType ?? 'telecom_service') === 'supply_trading'

// ── Supply / trading project form state ──────────────────────────────────────
interface SupplyFormState {
  name: string
  customerId: string
  customerName: string
  status: Project['status']
  startDate: string
  endDate: string
  pm: string
  customerContact: string
  poReference: string
  deliveryDeadline: string
  deliveryAddress: string
  deliveryStatus: DeliveryStatus
  notes: string
  quoteNumber: string
}

const emptySupplyForm = (): SupplyFormState => ({
  name: '', customerId: '', customerName: '', status: 'not_started', startDate: '', endDate: '',
  pm: '', customerContact: '', poReference: '', deliveryDeadline: '',
  deliveryAddress: '', deliveryStatus: 'pending', notes: '', quoteNumber: '',
})

const seedSupplyForm = (p: Project): SupplyFormState => ({
  name: p.name ?? '', customerId: p.customerId ?? '', customerName: p.customerName ?? '', status: p.status ?? 'not_started',
  startDate: p.startDate ?? '', endDate: p.endDate ?? '', pm: p.pm ?? '',
  customerContact: p.customerContact ?? '', poReference: p.poReference ?? '',
  deliveryDeadline: p.deliveryDeadline ?? '', deliveryAddress: p.deliveryAddress ?? '',
  deliveryStatus: p.deliveryStatus ?? 'pending', notes: p.notes ?? '', quoteNumber: '',
})

const SUPPLY_STATUSES = ['not_started', 'in_progress', 'on_hold', 'completed', 'cancelled'] as const

/**
 * Create/edit modal for SUPPLY / TRADING projects. Common fields + delivery
 * info + an inline goods table; on save the line totals write back to
 * budget (BAC = total cost), spent (AC = 0), revenue (PO = total selling).
 */
function SupplyProjectModal({ open, project, items, itemsLoading, editable, onClose, onSave }: {
  open: boolean
  project?: Project
  items: SupplyItem[]
  itemsLoading: boolean
  editable: boolean
  onClose: () => void
  onSave: (form: SupplyFormState, rows: SupplyItem[]) => Promise<void>
}) {
  const [form, setForm] = useState<SupplyFormState>(emptySupplyForm)
  const [rows, setRows] = useState<SupplyItem[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Quote + customer-module lookups for pre-filling a supply project.
  const { data: quotes } = useEntity<Quote>(TABLES.quotes)
  const { data: companies } = useEntity<Company>(TABLES.companies)
  const { data: contacts } = useEntity<Contact>(TABLES.contacts)

  // Customer Contact options are ALWAYS restricted to Contacts linked to the
  // selected customer (company_id == customerId) — never the global list.
  const customerContacts = useMemo(() =>
    contacts.filter(c => c.companyId === form.customerId),
    [contacts, form.customerId]
  )
  const contactLabel = (c: Contact) => [c.firstName, c.lastName].filter(Boolean).join(' ')
  // A value saved before this restriction (free text) must survive an edit.
  const legacyContact = form.customerContact &&
    !customerContacts.some(c => contactLabel(c) === form.customerContact)
    ? form.customerContact
    : ''

  // Seed the form whenever the modal opens (create → blank, edit → project).
  useEffect(() => {
    if (open) setForm(project ? seedSupplyForm(project) : emptySupplyForm())
  }, [open, project])

  // Seed goods rows once the async items load (edit), and only while pristine
  // so user edits are never overwritten by a refresh.
  useEffect(() => {
    if (open && !dirty && !itemsLoading && items.length > 0) {
      setRows(items.map((i) => ({ ...i })))
    }
  }, [open, dirty, itemsLoading, items])

  const set = (k: keyof SupplyFormState, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const updateRow = (idx: number, patch: Record<string, any>) => {
    setDirty(true)
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  const addRow = () => {
    setDirty(true)
    setRows((rs) => [...rs, { description: '', unit: 'U', qty: 1, purchasePrice: 0, sellingPrice: 0 }])
  }
  const removeRow = (idx: number) => {
    setDirty(true)
    setRows((rs) => rs.filter((_, i) => i !== idx))
  }

  const totals = supplyTotals(rows)
  const margin = totals.selling - totals.cost

  // Picking a quote pulls its number as the project name, its customer, and
  // its line items into the goods table (code 1..n, selling price from the
  // quote; purchase price stays manual).
  const applyQuote = (number: string) => {
    const q = quotes.find((x) => x.number === number)
    setForm((f) => ({
      ...f,
      quoteNumber: number,
      name: q?.number ?? f.name,
      customerId: q?.customerId ?? f.customerId,
      customerName: q?.customerName ?? f.customerName,
    }))
    if (q) {
      setDirty(true)
      setRows((q.items ?? []).map((it, i) => ({
        code: String(i + 1),
        description: it.description ?? '',
        unit: it.unit ?? 'U',
        qty: Number(it.quantity) || 0,
        purchasePrice: 0, // manual
        sellingPrice: Number(it.unitPrice) || 0,
      })))
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Project name is required'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave(form, rows)
      onClose()
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={project ? `Edit supply project — ${project.name}` : 'New Supply / Trading project'} size="xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          {error && <p className="text-xs text-red-500 flex-1">{error}</p>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {editable && <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>}
        </div>
      }>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="From Quote" value={form.quoteNumber} onChange={(e) => applyQuote(e.target.value)}>
            <option value="">— none —</option>
            {quotes.map(q => <option key={q.id} value={q.number}>{q.number} — {q.customerName}</option>)}
          </Select>
          <Input label="Project name" required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Cables — client A" />
          <Select label="Customer" value={form.customerName} onChange={(e) => {
            const c = companies.find((x) => x.name === e.target.value)
            set('customerName', e.target.value)
            set('customerId', c?.id ?? '')
          }}>
            <option value="">Select customer…</option>
            {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </Select>
          <Select label="Status" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {SUPPLY_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </Select>
          <Input label="Project Manager" value={form.pm} onChange={(e) => set('pm', e.target.value)} placeholder="PM name" />
          <Input label="Start Date" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          <Input label="End Date" type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
          <Select label="Customer Contact" value={form.customerContact}
            onChange={(e) => set('customerContact', e.target.value)}
            disabled={!form.customerId}
            title={form.customerId ? undefined : 'Select a customer first — contacts are restricted to that customer'}>
            <option value="">{form.customerId ? '— none —' : 'Select a customer first…'}</option>
            {legacyContact && <option value={legacyContact}>{legacyContact}</option>}
            {customerContacts.map(c => (
              <option key={c.id} value={contactLabel(c)}>
                {contactLabel(c)}{c.title ? ` — ${c.title}` : ''}{c.email ? ` (${c.email})` : ''}
              </option>
            ))}
          </Select>
          <Input label="PO Reference" value={form.poReference} onChange={(e) => set('poReference', e.target.value)} placeholder="Client PO number" />
          <Input label="Delivery Deadline" type="date" value={form.deliveryDeadline} onChange={(e) => set('deliveryDeadline', e.target.value)} />
          <Select label="Delivery Status" value={form.deliveryStatus} onChange={(e) => set('deliveryStatus', e.target.value)}>
            {['pending', 'partial', 'delivered'].map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <div className="sm:col-span-2">
            <Input label="Delivery Address" value={form.deliveryAddress} onChange={(e) => set('deliveryAddress', e.target.value)} placeholder="Delivery address" />
          </div>
          <div className="sm:col-span-2">
            <Input label="Notes / description" value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Notes" />
          </div>
        </div>

        {/* Goods line items */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Goods Line Items</p>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 overflow-x-auto">
            <div className="flex items-center gap-2 px-3 py-1.5 min-w-[780px] text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <span className="w-16">Code</span>
              <span className="flex-1">Description</span>
              <span className="w-14">Unit</span>
              <span className="w-14 text-right">Qty</span>
              <span className="w-28 text-right">Purchase</span>
              <span className="w-28 text-right">Selling</span>
              <span className="w-28 text-right">Margin</span>
              <span className="w-28 text-right">Total</span>
              <span className="w-6" />
            </div>
            {rows.map((r, idx) => {
              const perUnitMargin = (Number(r.sellingPrice) || 0) - (Number(r.purchasePrice) || 0)
              return (
                <div key={idx} className="flex items-center gap-2 px-3 py-1.5 min-w-[780px]">
                  <input className="input w-16" placeholder="Code" value={r.code ?? ''} onChange={(e) => updateRow(idx, { code: e.target.value })} />
                  <input className="input flex-1" placeholder="Description" value={r.description ?? ''} onChange={(e) => updateRow(idx, { description: e.target.value })} />
                  <input className="input w-14" placeholder="Unit" value={r.unit ?? ''} onChange={(e) => updateRow(idx, { unit: e.target.value })} />
                  <input className="input w-14 text-right" type="number" min={0} value={r.qty ?? ''} onChange={(e) => updateRow(idx, { qty: e.target.value })} />
                  <input className="input w-28 text-right" type="number" min={0} value={r.purchasePrice ?? ''} onChange={(e) => updateRow(idx, { purchasePrice: e.target.value })} />
                  <input className="input w-28 text-right" type="number" min={0} value={r.sellingPrice ?? ''} onChange={(e) => updateRow(idx, { sellingPrice: e.target.value })} />
                  <span className={`w-28 text-right text-xs font-semibold ${perUnitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{perUnitMargin.toLocaleString()}</span>
                  <span className="w-28 text-right text-xs font-semibold">{((Number(r.qty) || 0) * (Number(r.sellingPrice) || 0)).toLocaleString()}</span>
                  <div className="w-6 flex justify-end">
                    <button type="button" onClick={() => removeRow(idx)} aria-label="Remove line" className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  </div>
                </div>
              )
            })}
            <div className="px-3 py-2">
              <Button type="button" variant="secondary" onClick={addRow}>+ Add Item</Button>
            </div>
            <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800 text-xs space-y-1">
              <div className="flex gap-8"><span className="text-slate-500 w-32">TOTAL COST (AC)</span><span className="font-bold">{fmt(totals.cost)}</span></div>
              <div className="flex gap-8"><span className="text-slate-500 w-32">TOTAL REVENUE (PO)</span><span className="font-bold text-green-600">{fmt(totals.selling)}</span></div>
              <div className="flex gap-8"><span className="text-slate-500 w-32">TOTAL MARGIN</span><span className={`font-bold ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(margin)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function ProjectsModule() {
  const { data: sites } = useEntity<Site>(TABLES.sites)
  const { data: projectSites, refresh: refreshProjectSites } = useEntity<ProjectSite>(TABLES.projectSites)

  // Keep the junction table in sync when the form's site selection changes.
  // 1 project = many sites: `values` carries the virtual `siteId` multi-select
  // (stripped from the projects row itself); we rewrite the project_sites rows
  // here, on both create and edit.
  const syncSites = async (row: Project, values: Record<string, any>) => {
    const raw = values.siteIds
    const siteIds: string[] = Array.isArray(raw)
      ? raw.filter((s: unknown) => typeof s === 'string' && s)
      : (typeof raw === 'string' && raw ? [raw] : [])
    const { error: del } = await supabase.from('project_sites').delete().eq('project_id', row.id)
    if (del) throw del
    for (const siteId of siteIds) {
      const { error: ins } = await supabase.from('project_sites').insert({ project_id: row.id, site_id: siteId })
      if (ins) throw ins
    }
    await refreshProjectSites()
  }

  const { data: projects, loading, error, openCreate, openEdit, remove, create, update, refresh, modal, editable } = useEntityCrud<Project>(
    TABLES.projects, 'Project', undefined, syncSites, undefined, syncSites
  )
  const [selected, setSelected] = useState<Project | null>(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterSite, setFilterSite] = useState('')
  const [filterType, setFilterType] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  // Supply/trading flow state
  const [typePickerOpen, setTypePickerOpen] = useState(false)
  const [supplyModal, setSupplyModal] = useState<{ mode: 'create' } | { mode: 'edit'; project: Project } | null>(null)
  const editSupplyId = supplyModal?.mode === 'edit' ? supplyModal.project.id : undefined
  const { items: supplyModalItems, loading: supplyModalLoading, save: saveSupplyItems } = useSupplyItems(editSupplyId)
  const { items: detailSupplyItems } = useSupplyItems(selected && isSupply(selected) ? selected.id : undefined)

  // Lightweight per-project goods-line counts for the cards.
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({})
  const loadItemCounts = useCallback(async () => {
    const { data } = await supabase.from('project_supply_items').select('project_id')
    const map: Record<string, number> = {}
    for (const r of data ?? []) map[r.project_id] = (map[r.project_id] ?? 0) + 1
    setItemCounts(map)
  }, [])
  useEffect(() => { void loadItemCounts() }, [loadItemCounts])

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

  // ── Filter bar ─────────────────────────────────────────────────────────────
  // Search by name, customer_name, site code — AND logic, combined with the
  // status tabs. Tab labels show the count of results for each status.
  const customerOptions = useMemo(() =>
    [...new Set(projects.map(p => p.customerName ?? '').filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [projects]
  )
  const siteCodeOptions = useMemo(() => {
    const codes = new Set<string>()
    for (const list of sitesByProject.values()) for (const s of list) codes.add(s.siteId)
    return [...codes].sort((a, b) => a.localeCompare(b))
  }, [sitesByProject])

  const matchesFilters = useCallback((p: Project) => {
    const q = search.trim().toLowerCase()
    const nameMatch = !q || (p.name ?? '').toLowerCase().includes(q)
    const custMatch = !filterCustomer || (p.customerName ?? '') === filterCustomer
    const siteMatch = !filterSite || (sitesByProject.get(p.id ?? '') ?? []).some(s => s.siteId === filterSite)
    const typeMatch = !filterType || (p.projectType ?? 'telecom_service') === filterType
    return nameMatch && custMatch && siteMatch && typeMatch
  }, [search, filterCustomer, filterSite, sitesByProject, filterType])

  const filteredBase = useMemo(() => projects.filter(matchesFilters), [projects, matchesFilters])
  const filtered = filteredBase.filter(p => filterStatus === 'all' || p.status === filterStatus)
  const countFor = (status: string) => status === 'all'
    ? filteredBase.length
    : filteredBase.filter(p => p.status === status).length
  const hasFilter = search !== '' || filterCustomer !== '' || filterSite !== '' || filterType !== ''

  // ── Summary split by type ──────────────────────────────────────────────────
  const byType = (t: ProjectType) => {
    const list = projects.filter(p => (p.projectType ?? 'telecom_service') === t)
    return {
      count: list.length,
      bac: list.reduce((s, p) => s + (p.budget ?? 0), 0),
      po: list.reduce((s, p) => s + (p.revenue ?? 0), 0),
      profit: list.reduce((s, p) => s + ((p.revenue ?? 0) - (p.spent ?? 0)), 0),
    }
  }

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

  // ── Supply project save: project row + goods lines ─────────────────────────
  const handleSupplySave = async (form: SupplyFormState, rows: SupplyItem[]) => {
    const totals = supplyTotals(rows)
    const payload: Partial<Project> = {
      name: form.name.trim(),
      customerName: form.customerName.trim(),
      status: form.status,
      pm: form.pm,
      currentPhase: 'survey',
      phases: [],
      // Supply projects have no phases — progress stays as-is on edit, and
      // jumps to 100% automatically when the status is set to completed.
      progress: form.status === 'completed'
        ? 100
        : (supplyModal?.mode === 'edit' ? (supplyModal.project.progress ?? 0) : 0),
      region: '' as Region,
      // budget/spent/revenue are bigint columns — round fractional totals.
      // For supply, AC (spent) = the purchase cost, known at creation; we buy
      // to sell, so BAC = AC and the profit = PO − AC (the trading margin).
      budget: Math.round(totals.cost),
      spent: Math.round(totals.cost),
      revenue: Math.round(totals.selling),
      projectType: 'supply_trading',
      customerContact: form.customerContact,
      poReference: form.poReference,
      deliveryAddress: form.deliveryAddress,
      deliveryStatus: form.deliveryStatus,
      notes: form.notes,
    }
    // uuid / date columns reject '' — only send them when actually set.
    if (form.customerId) payload.customerId = form.customerId
    if (form.startDate) payload.startDate = form.startDate
    if (form.endDate) payload.endDate = form.endDate
    if (form.deliveryDeadline) payload.deliveryDeadline = form.deliveryDeadline
    if (supplyModal?.mode === 'edit' && supplyModal.project.id) {
      await update(supplyModal.project.id, payload)
      await saveSupplyItems(supplyModal.project.id, rows)
    } else {
      const row = await create(payload)
      if (row?.id) await saveSupplyItems(row.id, rows)
    }
    await refresh()
    await loadItemCounts()
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

      {/* Summary breakdown by type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {([['telecom_service', '📡 Telecom Service'], ['supply_trading', '📦 Supply / Trading']] as [ProjectType, string][]).map(([t, label]) => {
          const s = byType(t)
          return (
            <Card key={t} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{label}</p>
                <p className="text-xs text-slate-500">{s.count} projects</p>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                <span>BAC: <span className="font-bold">{fmt(s.bac)}</span></span>
                <span>PO: <span className="font-bold text-green-600">{fmt(s.po)}</span></span>
                <span>Profit: <span className={`font-bold ${s.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(s.profit)}</span></span>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Filter bar — search / customer / site / type (AND), above the status tabs */}
      <div className="flex flex-wrap gap-3 items-end bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
        <div className="min-w-[180px] flex-1">
          <Input label="Search project name" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type to filter…" />
        </div>
        <div className="min-w-[150px]">
          <Select label="Customer" value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)}>
            <option value="">All customers</option>
            {customerOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div className="min-w-[150px]">
          <Select label="Site code" value={filterSite} onChange={(e) => setFilterSite(e.target.value)}>
            <option value="">All sites</option>
            {siteCodeOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div className="min-w-[150px]">
          <Select label="Type" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All types</option>
            <option value="telecom_service">📡 Telecom Service</option>
            <option value="supply_trading">📦 Supply / Trading</option>
          </Select>
        </div>
        {hasFilter && (
          <Button variant="secondary" onClick={() => { setSearch(''); setFilterCustomer(''); setFilterSite(''); setFilterType('') }}>
            Clear
          </Button>
        )}
      </div>

      {/* Filters + Actions */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {['all','not_started','in_progress','on_hold','completed'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded capitalize transition-all ${filterStatus===s ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>
              {s.replace('_',' ')} <span className="opacity-70">({countFor(s)})</span>
            </button>
          ))}
        </div>
        {editable && <Button icon={<Plus className="w-4 h-4"/>} onClick={() => setTypePickerOpen(true)}>New Project</Button>}
      </div>
      {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>}
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}
      {loading && <p className="text-xs text-slate-500">Loading…</p>}

      {/* Project Cards */}
      <div className="space-y-4">
        {filtered.map(p => {
          const supply = isSupply(p)
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
                          {supply
                            ? <Badge variant="orange">📦 Supply</Badge>
                            : <Badge variant="blue">📡 Telecom</Badge>}
                          {!supply && (
                            <>
                              <span className="text-xs font-mono text-slate-400">{sites.length > 0 ? sites.map(s => s.siteId).join(', ') : '—'}</span>
                              {p.scopeBuildType && p.scopeTechnology && (
                                <span className="text-xs font-semibold rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-slate-600 dark:text-slate-300">
                                  SOW: {p.scopeBuildType}-{p.scopeTechnology}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">{p.customerName}{p.region ? ` · ${p.region}` : ''}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      {supply ? (
                        <div className="flex flex-wrap items-center gap-4 text-xs">
                          <span>Delivery: <Badge status={p.deliveryStatus ?? 'pending'} /></span>
                          <span>Items: <span className="font-bold">{itemCounts[p.id ?? ''] ?? 0}</span> lines</span>
                          {p.poReference && <span>PO Ref: <span className="font-mono font-semibold">{p.poReference}</span></span>}
                          {p.deliveryDeadline && <span>Deadline: <span className="font-semibold">{p.deliveryDeadline}</span></span>}
                        </div>
                      ) : (
                        <PhaseTimeline phases={p.phases ?? []} currentPhase={p.currentPhase} progress={p.progress} />
                      )}
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
              {editable && (
                <>
                  <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(selected.id!)}>Delete</Button>
                  <Button icon={<Pencil className="w-4 h-4" />} onClick={() => {
                    if (isSupply(selected)) { setSupplyModal({ mode: 'edit', project: selected }); setSelected(null) }
                    else { openEdit({ ...selected, siteIds: selSites.map(s => s.id) } as Project); setSelected(null) }
                  }}>Edit</Button>
                </>
              )}
            </div>
          }>
          {isSupply(selected) ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { l: 'Type',       v: <Badge variant="orange">📦 Supply / Trading</Badge> },
                  { l: 'Customer',   v: selected.customerName },
                  { l: 'PM',         v: selected.pm },
                  { l: 'Status',     v: <Badge status={selected.status} /> },
                  { l: 'PO Ref',     v: selected.poReference ?? '—' },
                  { l: 'Delivery Status', v: <Badge status={selected.deliveryStatus ?? 'pending'} /> },
                  { l: 'Deadline',   v: selected.deliveryDeadline ?? '—' },
                  { l: 'Contact',    v: selected.customerContact ?? '—' },
                ].map(item => (
                  <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 break-all">{item.v}</p>
                  </div>
                ))}
              </div>
              {selected.deliveryAddress && (
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Delivery Address</p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">{selected.deliveryAddress}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Goods ({detailSupplyItems.length})</p>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                  <table className="w-full min-w-[780px]">
                    <thead className="bg-slate-50 dark:bg-slate-700/50">
                      <tr>
                        <th className="th w-16">Code</th>
                        <th className="th">Description</th>
                        <th className="th w-14">Unit</th>
                        <th className="th w-14 text-right">Qty</th>
                        <th className="th w-28 text-right">Purchase</th>
                        <th className="th w-28 text-right">Selling</th>
                        <th className="th w-28 text-right">Margin</th>
                        <th className="th w-28 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailSupplyItems.map((it) => {
                        const perUnitMargin = (Number(it.sellingPrice) || 0) - (Number(it.purchasePrice) || 0)
                        const total = (Number(it.qty) || 0) * (Number(it.sellingPrice) || 0)
                        return (
                          <tr key={it.id ?? it.code} className="border-t border-slate-100 dark:border-slate-700">
                            <td className="td w-16 font-mono text-xs">{it.code ?? '—'}</td>
                            <td className="td font-semibold">{it.description}</td>
                            <td className="td w-14 text-xs">{it.unit}</td>
                            <td className="td w-14 text-right">{it.qty}</td>
                            <td className="td w-28 text-right">{fmt(it.purchasePrice)}</td>
                            <td className="td w-28 text-right">{fmt(it.sellingPrice)}</td>
                            <td className={`td w-28 text-right font-bold ${perUnitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(perUnitMargin)}</td>
                            <td className="td w-28 text-right font-bold">{fmt(total)}</td>
                          </tr>
                        )
                      })}
                      {detailSupplyItems.length === 0 && (
                        <tr><td colSpan={8} className="td text-slate-400">No goods lines.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="bg-slate-50 dark:bg-slate-700/30 p-4 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex flex-col items-end gap-1.5 text-sm">
                      <div className="flex gap-8"><span className="text-slate-500">Total Cost (AC)</span><span className="font-bold">{fmt(detailSupplyItems.reduce((s, i) => s + supplyTotals([i]).cost, 0))}</span></div>
                      <div className="flex gap-8"><span className="text-slate-500">Total Revenue (PO)</span><span className="font-bold text-green-600">{fmt(detailSupplyItems.reduce((s, i) => s + supplyTotals([i]).selling, 0))}</span></div>
                      <div className="flex gap-8"><span className="text-slate-500">Total Margin</span><span className="font-bold text-brand-600">{fmt(detailSupplyItems.reduce((s, i) => { const l = supplyTotals([i]); return s + l.selling - l.cost }, 0))}</span></div>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">EVM Summary</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { l: 'BAC',       v: fmt(selected.budget) },
                    { l: 'AC',        v: fmt(selected.spent) },
                    { l: 'PO',        v: fmt(selected.revenue) },
                    { l: 'Variance',  v: <span className={selFin.varianceColor}>{fmt(selFin.variance)}</span> },
                    { l: 'Profit (excl. tax)', v: <span className={selFin.profitColor}>{fmt(selFin.profit)}</span> },
                  ].map(item => (
                    <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{item.v}</p>
                    </div>
                  ))}
                </div>
              </div>
              {selected.notes && <p className="text-sm text-slate-500 italic">{selected.notes}</p>}
            </div>
          ) : (
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
              {(selected.scopeBuildType || selected.scopeTechnology) && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Scope of Work</p>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 text-sm">
                    <div className="flex gap-3 px-3 py-2"><span className="w-28 text-slate-500 text-xs font-semibold uppercase">Build Type</span><span className="font-semibold">{selected.scopeBuildType ?? '—'}</span></div>
                    <div className="flex gap-3 px-3 py-2"><span className="w-28 text-slate-500 text-xs font-semibold uppercase">Technology</span><span className="font-semibold">{selected.scopeTechnology ?? '—'}</span></div>
                    {(selected.scopeNsbRanItems?.length ?? 0) > 0 && <div className="flex gap-3 px-3 py-2"><span className="w-28 text-slate-500 text-xs font-semibold uppercase">Items</span><span>{selected.scopeNsbRanItems!.join(', ')}</span></div>}
                    {selected.scopeNsbMwDishSize && <div className="flex gap-3 px-3 py-2"><span className="w-28 text-slate-500 text-xs font-semibold uppercase">Dish</span><span>{selected.scopeNsbMwDishSize}</span></div>}
                    {(selected.scopeModRanAddItems?.length ?? 0) > 0 && <div className="flex gap-3 px-3 py-2"><span className="w-28 text-slate-500 text-xs font-semibold uppercase">ADD</span><span>{selected.scopeModRanAddItems!.join(', ')}</span></div>}
                    {(selected.scopeModRanSwapItems?.length ?? 0) > 0 && <div className="flex gap-3 px-3 py-2"><span className="w-28 text-slate-500 text-xs font-semibold uppercase">SWAP</span><span>{selected.scopeModRanSwapItems!.join(', ')}</span></div>}
                    {selected.scopeModMwSwapDishSize && <div className="flex gap-3 px-3 py-2"><span className="w-28 text-slate-500 text-xs font-semibold uppercase">Dish (SWAP)</span><span>{selected.scopeModMwSwapDishSize}</span></div>}
                  </div>
                </div>
              )}
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
          )}
        </Modal>
      )}

      {/* Type picker for new projects */}
      {typePickerOpen && (
        <Modal open title="New project — choose type" onClose={() => setTypePickerOpen(false)} size="md">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => { setTypePickerOpen(false); openCreate() }}
              className="rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-400 p-4 text-left transition-colors"
            >
              <p className="text-lg">📡 Telecom Service</p>
              <p className="text-xs text-slate-500 mt-1">Field service with sites & phases</p>
            </button>
            <button
              onClick={() => { setTypePickerOpen(false); setSupplyModal({ mode: 'create' }) }}
              className="rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 dark:hover:border-brand-400 p-4 text-left transition-colors"
            >
              <p className="text-lg">📦 Supply / Trading</p>
              <p className="text-xs text-slate-500 mt-1">Goods sales — no sites, no phases</p>
            </button>
          </div>
        </Modal>
      )}

      {/* Supply create/edit modal */}
      {supplyModal && (
        <SupplyProjectModal
          open
          project={supplyModal.mode === 'edit' ? supplyModal.project : undefined}
          items={supplyModalItems}
          itemsLoading={supplyModalLoading}
          editable={editable}
          onClose={() => setSupplyModal(null)}
          onSave={handleSupplySave}
        />
      )}

      {modal}
    </div>
  )
}
