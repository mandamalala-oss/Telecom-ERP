import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from 'recharts'
import { Camera, Plus, Pencil, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { useEntity } from '@/lib/hooks/useEntity'
import { appendSnapshot, deriveEVM, evFromProgress, rollupCustomerEVM } from '@/lib/evm'
import { TABLES } from '@/lib/api/entityConfigs'
import type { EVMMetrics, ProjectSite, Site } from '@/types'
import { clsx } from 'clsx'

const fmt    = (n: number | null | undefined) => { const v = n ?? 0; return v >= 1e6 ? `${(v/1e6).toFixed(2)}M Ar` : `${v.toLocaleString()} Ar` }
const fmtM   = (n: number | null | undefined) => `${((n ?? 0)/1e6).toFixed(1)}M`
const pct    = (n: number | null | undefined) => `${((n ?? 0)*100).toFixed(1)}%`

function IndexGauge({ label, value, good = true }: { label: string; value: number | null | undefined; good?: boolean }) {
  const isGood    = good ? (value ?? 0) >= 1 : (value ?? 0) <= 1
  const deviation = Math.abs(((value ?? 1) - 1) * 100).toFixed(1)
  return (
    <div className="text-center p-4 rounded-xl bg-slate-50 dark:bg-slate-700/50">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</p>
      <p className={clsx('text-3xl font-black', isGood ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
        {(value ?? 0).toFixed(3)}
      </p>
      <p className={clsx('text-xs font-semibold mt-1', isGood ? 'text-green-500' : 'text-red-500')}>
        {(value ?? 0) === 1 ? 'On target' : `${isGood ? '+' : '-'}${deviation}% vs baseline`}
      </p>
    </div>
  )
}

function SiteList({ sites, limit = 0 }: { sites: Site[]; limit?: number }) {
  if (sites.length === 0) return <p className="text-xs font-mono text-slate-400 mt-0.5">— no sites linked —</p>
  const shown = limit > 0 ? sites.slice(0, limit) : sites
  const rest = sites.length - shown.length
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {shown.map(s => (
        <span key={s.id} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300">
          {s.siteId} — {s.name}
        </span>
      ))}
      {rest > 0 && <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300">+{rest} more</span>}
    </div>
  )
}

function EVMRow({ label, value, subtitle, highlight }: { label: string; value: string; subtitle?: string; highlight?: 'good'|'bad'|'neutral' }) {
  return (
    <div className={clsx('flex items-center justify-between py-2.5 px-3 rounded-lg',
      highlight === 'good' ? 'bg-green-50 dark:bg-green-900/20' :
      highlight === 'bad'  ? 'bg-red-50 dark:bg-red-900/20' : 'bg-slate-50 dark:bg-slate-700/30')}>
      <div>
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">{label}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <p className={clsx('text-sm font-black',
        highlight === 'good' ? 'text-green-700 dark:text-green-400' :
        highlight === 'bad'  ? 'text-red-700 dark:text-red-400'     : 'text-slate-900 dark:text-white')}>
        {value}
      </p>
    </div>
  )
}

export function EVMModule() {
  const { data: evmList, loading, error, openCreate, openEdit, remove, update, modal } = useEntityCrud<EVMMetrics>(
    TABLES.evmMetrics, 'EVM Record', undefined, undefined,
    // Only PO/BAC/PV/AC (and percentComplete) are entered in the form; EV is
    // derived (= BAC × progress %) and the rest of the EVM metrics are
    // computed before the row is saved.
    (values) => {
      const bac = Number(values.bac) || 0
      const ev = evFromProgress(bac, Number(values.percentComplete) || 0)
      const { cpi, spi, sv, cv, eac, etc, vac, tcpi } = deriveEVM(
        bac, Number(values.pv) || 0, ev, Number(values.ac) || 0,
      )
      return { ...values, ev, cpi, spi, sv, cv, eac, etc, vac, tcpi }
    }
  )
  const [selected, setSelected] = useState<EVMMetrics | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null)

  // A project covers one or more sites (project_sites junction) and EVM is
  // one record per project — so resolve every site behind the project and
  // show them as chips: one engagement (project + customer) = one EVM that
  // lists its sites, like the original multi-site model.
  const { data: projectSites } = useEntity<ProjectSite>(TABLES.projectSites)
  const { data: sites } = useEntity<Site>(TABLES.sites)
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

  // Program-level view: sum BAC/PV/EV/AC across each customer's sites and
  // re-derive the EVM metrics from the totals.
  const rollups = useMemo(() => rollupCustomerEVM(evmList), [evmList])

  // Append the record's current state to `history` so the S-curve / variance
  // charts accumulate over time instead of showing a single flat point.
  const saveSnapshot = async () => {
    if (!selected?.id) return
    setSnapshotMsg(null)
    setActionError(null)
    try {
      const date = selected.dataDate || new Date().toISOString().slice(0, 10)
      const next = appendSnapshot(selected.history ?? [], {
        date, pv: selected.pv ?? 0, ev: selected.ev ?? 0, ac: selected.ac ?? 0,
      })
      const row = await update(selected.id, { history: next })
      setSelected(row)
      setSnapshotMsg(`Snapshot saved for ${date} — ${next.length} point${next.length === 1 ? '' : 's'} on the S-curve.`)
    } catch (err: any) {
      setActionError(err.message ?? String(err))
    }
  }

  const handleDelete = async (e: EVMMetrics) => {
    if (!confirm('Delete this EVM record?')) return
    try {
      setActionError(null)
      await remove(e.id!)
      if (selected?.projectId === e.projectId) setSelected(null)
    } catch (err: any) {
      setActionError(err.message ?? String(err))
    }
  }

  useEffect(() => {
    if (evmList.length === 0) return
    // Keep the selection in sync: if the selected row disappeared from the
    // list (deleted, filtered), fall back to the first row instead of
    // rendering stale metrics forever.
    if (!selected || !evmList.some(e => e.projectId === selected.projectId)) {
      setSelected(evmList[0])
    }
  }, [evmList, selected])

  if (loading) return <p className="text-xs text-slate-500">Loading…</p>
  if (error) return <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>

  const selSites = sitesByProject.get(selected?.projectId ?? '') ?? []
  const snapCount = selected?.history?.length ?? 0

  // Charts fall back to the current snapshot when no history series exists,
  // so a fresh record still renders the S-curve and variance charts.
  const history = selected?.history ?? []
  const trendData = history.length > 0
    ? history.map(h => ({ date: h.date, PV: (h.pv ?? 0) / 1e6, EV: (h.ev ?? 0) / 1e6, AC: (h.ac ?? 0) / 1e6 }))
    : [{ date: selected?.dataDate ?? 'now', PV: (selected?.pv ?? 0) / 1e6, EV: (selected?.ev ?? 0) / 1e6, AC: (selected?.ac ?? 0) / 1e6 }]

  const varianceData = history.length > 0
    ? history.map(h => ({ date: h.date, SV: ((h.ev ?? 0) - (h.pv ?? 0)) / 1e6, CV: ((h.ev ?? 0) - (h.ac ?? 0)) / 1e6 }))
    : [{ date: selected?.dataDate ?? 'now', SV: ((selected?.ev ?? 0) - (selected?.pv ?? 0)) / 1e6, CV: ((selected?.ev ?? 0) - (selected?.ac ?? 0)) / 1e6 }]

  const summaryData = evmList.map(e => ({
    name: (e.projectName ?? '').split(' ').slice(0, 3).join(' '),
    CPI: e.cpi ?? 0,
    SPI: e.spi ?? 0,
  }))

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">One record per engagement (its project). Enter PO (customer), BAC (internal budget), PV, AC and progress % — EV = BAC × progress, and CPI, SPI, SV, CV, EAC, ETC, VAC, TCPI, Benefit (PO − AC) are computed automatically. As work progresses, edit the record and <strong>Save snapshot</strong> to build the S-curve over time; the Customer Rollup below sums all of a customer's sites.</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openCreate}>New EVM Record</Button>
      </div>
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}

      {!selected ? (
        <p className="text-sm text-slate-500">No EVM data yet — click “New EVM Record” to add the first cost/schedule snapshot.</p>
      ) : (
        <>
      {/* Project selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {evmList.map(e => (
          <Card key={`${e.projectId}-${e.dataDate ?? ''}`} hover padding={false}
            onClick={() => setSelected(e)}
            className={clsx('p-4 border-2 transition-all', selected.projectId === e.projectId
              ? 'border-brand-500 shadow-md' : 'border-transparent')}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-bold text-brand-600 dark:text-brand-400">{e.customerName}</p>
              <div className="flex gap-1 flex-shrink-0" onClick={ev => ev.stopPropagation()}>
                <button onClick={() => openEdit(e)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleDelete(e)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{e.projectName}</p>
            <SiteList sites={sitesByProject.get(e.projectId ?? '') ?? []} limit={2} />
            <div className="grid grid-cols-3 gap-2 text-center mt-2">
              <div>
                <p className="text-xs text-slate-400">CPI</p>
                <p className={clsx('text-lg font-black', (e.cpi ?? 0) >= 1 ? 'text-green-600' : 'text-red-600')}>{(e.cpi ?? 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">SPI</p>
                <p className={clsx('text-lg font-black', (e.spi ?? 0) >= 1 ? 'text-green-600' : 'text-amber-600')}>{(e.spi ?? 0).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Done</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">{e.percentComplete ?? 0}%</p>
              </div>
            </div>
            <div className="mt-3 w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
              <div className={clsx('h-1.5 rounded-full', (e.percentComplete ?? 0) > 80 ? 'bg-green-500' : 'bg-brand-500')}
                style={{ width: `${Math.min(100, e.percentComplete ?? 0)}%` }} />
            </div>
          </Card>
        ))}
      </div>

      {/* Customer rollup — program-level EVM across all of a customer's sites */}
      {rollups.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="section-title">Customer Rollup</h3>
            <p className="text-xs text-slate-400">Program-level EVM — all sites of each customer combined (one EVM record per site-installation)</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
            {rollups.map(r => (
              <Card key={r.customerName} padding={false} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{r.customerName}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                    {r.siteCount} site{r.siteCount === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center mt-3">
                  <div>
                    <p className="text-xs text-slate-400">CPI</p>
                    <p className={clsx('text-lg font-black', r.cpi >= 1 ? 'text-green-600' : 'text-red-600')}>{r.cpi.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">SPI</p>
                    <p className={clsx('text-lg font-black', r.spi >= 1 ? 'text-green-600' : 'text-amber-600')}>{r.spi.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Done</p>
                    <p className="text-lg font-black text-slate-900 dark:text-white">{Math.round(r.percentComplete)}%</p>
                  </div>
                </div>
                <div className="mt-3 w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                  <div className={clsx('h-1.5 rounded-full', r.percentComplete > 80 ? 'bg-green-500' : 'bg-brand-500')}
                    style={{ width: `${Math.min(100, r.percentComplete)}%` }} />
                </div>
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">PO</span><span className="font-bold">{fmt(r.po)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">BAC</span><span className="font-bold">{fmt(r.bac)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">PV / EV / AC</span><span className="font-bold">{fmt(r.pv)} / {fmt(r.ev)} / {fmt(r.ac)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Benefit (PO − AC)</span>
                    <span className={clsx('font-bold', r.benefit >= 0 ? 'text-green-600' : 'text-red-600')}>{fmt(r.benefit)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">SV / CV</span>
                    <span className="font-bold"><span className={r.sv >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(r.sv)}</span> / <span className={r.cv >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(r.cv)}</span></span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">EAC / VAC</span>
                    <span className="font-bold">{fmt(r.eac)} / <span className={r.vac >= 0 ? 'text-green-600' : 'text-red-600'}>{fmt(r.vac)}</span></span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Selected Project EVM Detail */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Metrics */}
        <div className="space-y-4">
          <Card className="p-4">
            <p className="section-title mb-1">{selected.projectName}</p>
            <SiteList sites={selSites} />
            <div className="flex items-center justify-between gap-2 mt-1 mb-4">
              <p className="text-xs text-slate-500">Data Date: <strong>{selected.dataDate}</strong></p>
              <button onClick={saveSnapshot} disabled={!selected.id}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed">
                <Camera className="w-3.5 h-3.5" /> Save snapshot
              </button>
            </div>
            {snapshotMsg && <p className="text-xs text-green-600 dark:text-green-400 mb-3">{snapshotMsg}</p>}
            {snapCount > 0 && <p className="text-xs text-slate-400 mb-3">📈 {snapCount} snapshot{snapCount === 1 ? '' : 's'} recorded — S-curve &amp; variance charts plot the trend.</p>}

            {/* CPI / SPI / TCPI gauges */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <IndexGauge label="CPI"  value={selected.cpi}  good />
              <IndexGauge label="SPI"  value={selected.spi}  good />
              <IndexGauge label="TCPI" value={selected.tcpi} good={false} />
            </div>

            <div className="space-y-1.5">
              <EVMRow label="PO — Customer PO" value={fmt(selected.po)} subtitle="Contracted value from the customer" highlight="neutral" />
              <EVMRow label="BAC — Internal Budget" value={fmt(selected.bac)} subtitle="Our budget at completion" highlight="neutral" />
              <EVMRow label="PV — Planned Value"  value={fmt(selected.pv)}  subtitle="Work planned to date" highlight="neutral" />
              <EVMRow label="EV — Earned Value"   value={fmt(selected.ev)}  subtitle="BAC × progress % (derived)" highlight={selected.ev >= selected.pv ? 'good' : 'bad'} />
              <EVMRow label="AC — Actual Cost"    value={fmt(selected.ac)}  subtitle="Cost incurred to date" highlight="neutral" />
              <EVMRow label="Benefit" value={fmt((selected.po ?? 0) - (selected.ac ?? 0))} subtitle="PO − AC" highlight={(selected.po ?? 0) - (selected.ac ?? 0) >= 0 ? 'good' : 'bad'} />
              <div className="my-2 border-t border-slate-200 dark:border-slate-700" />
              <EVMRow label="SV — Schedule Variance" value={fmt(selected.sv)} subtitle="EV − PV" highlight={selected.sv >= 0 ? 'good' : 'bad'} />
              <EVMRow label="CV — Cost Variance"     value={fmt(selected.cv)} subtitle="EV − AC" highlight={selected.cv >= 0 ? 'good' : 'bad'} />
              <div className="my-2 border-t border-slate-200 dark:border-slate-700" />
              <EVMRow label="EAC — Est. at Completion" value={fmt(selected.eac)} subtitle="BAC ÷ CPI" highlight={selected.eac <= selected.bac ? 'good' : 'bad'} />
              <EVMRow label="ETC — Est. to Complete"   value={fmt(selected.etc)} subtitle="EAC − AC" highlight="neutral" />
              <EVMRow label="VAC — Variance at Compl." value={fmt(selected.vac)} subtitle="BAC − EAC" highlight={selected.vac >= 0 ? 'good' : 'bad'} />
            </div>
          </Card>

          {/* Health Interpretation */}
          <Card className="p-4">
            <p className="text-sm font-bold text-slate-900 dark:text-white mb-3">📋 Performance Interpretation</p>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <div className={clsx('p-2 rounded-lg', selected.cpi >= 1 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400')}>
                <strong>Cost:</strong> {selected.cpi >= 1 ? `Under budget — getting ${pct(selected.cpi)} of value per Ariary spent.` : `Over budget — only getting ${pct(selected.cpi)} of value per Ariary spent.`}
              </div>
              <div className={clsx('p-2 rounded-lg', selected.spi >= 1 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400')}>
                <strong>Schedule:</strong> {selected.spi >= 1 ? `Ahead of schedule — completing ${pct(selected.spi)} of planned work.` : `Behind schedule — only ${pct(selected.spi)} of planned work done.`}
              </div>
              <div className={clsx('p-2 rounded-lg', selected.vac >= 0 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400')}>
                <strong>Forecast:</strong> {selected.vac >= 0 ? `On track to finish ${fmt(selected.vac)} under budget.` : `Forecast to exceed budget by ${fmt(Math.abs(selected.vac))}.`}
              </div>
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700/50">
                <strong>TCPI {selected.tcpi.toFixed(3)}:</strong> {selected.tcpi <= 1.0 ? 'Remaining work can be completed within budget at current efficiency.' : `Must achieve ${pct(selected.tcpi)} efficiency on remaining work to meet BAC — ${selected.tcpi > 1.1 ? '⚠️ challenging' : 'feasible'}.`}
              </div>
            </div>
          </Card>
        </div>

        {/* Right: Charts */}
        <div className="xl:col-span-2 space-y-4">
          <Card padding={false}>
            <div className="px-5 pt-5 pb-2">
              <h3 className="section-title">S-Curve: PV / EV / AC</h3>
              <p className="text-xs text-slate-500 mt-0.5">Cumulative values over time (M Ar)</p>
            </div>
            <div className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-700" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${v}M`} tick={{ fontSize: 11 }} width={42} />
                  <Tooltip formatter={(v: number) => [`${(v ?? 0).toFixed(1)}M Ar`]} />
                  <Legend />
                  <Line type="monotone" dataKey="PV" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4 }} name="PV (Planned)" />
                  <Line type="monotone" dataKey="EV" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6' }} name="EV (Earned)" />
                  <Line type="monotone" dataKey="AC" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4, fill: '#ef4444' }} name="AC (Actual)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card padding={false}>
            <div className="px-5 pt-5 pb-2">
              <h3 className="section-title">Variance Trend: SV &amp; CV</h3>
              <p className="text-xs text-slate-500 mt-0.5">Positive = good performance (M Ar)</p>
            </div>
            <div className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={varianceData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-700" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${v}M`} tick={{ fontSize: 11 }} width={42} />
                  <Tooltip formatter={(v: number) => [`${(v ?? 0).toFixed(2)}M Ar`]} />
                  <Legend />
                  <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
                  <Bar dataKey="SV" fill="#f59e0b" radius={[4,4,0,0]} name="Schedule Variance" />
                  <Bar dataKey="CV" fill="#3b82f6" radius={[4,4,0,0]} name="Cost Variance" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card padding={false}>
            <div className="px-5 pt-5 pb-2">
              <h3 className="section-title">Portfolio: CPI vs SPI</h3>
              <p className="text-xs text-slate-500 mt-0.5">All active projects — target ≥ 1.00</p>
            </div>
            <div className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={summaryData} margin={{ top: 5, right: 20, left: 0, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-100 dark:stroke-slate-700" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" interval={0} />
                  <YAxis domain={[0, 'dataMax']} tickFormatter={v => v.toFixed(2)} tick={{ fontSize: 11 }} width={42} />
                  <Tooltip formatter={(v: number) => (v ?? 0).toFixed(3)} />
                  <Legend />
                  <ReferenceLine y={1} stroke="#10b981" strokeDasharray="4 2" label={{ value: 'Target', position: 'insideTopRight', fontSize: 10 }} />
                  <Bar dataKey="CPI" fill="#3b82f6" radius={[3,3,0,0]} name="CPI" />
                  <Bar dataKey="SPI" fill="#f59e0b" radius={[3,3,0,0]} name="SPI" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
        </>
      )}
      {modal}
    </div>
  )
}
