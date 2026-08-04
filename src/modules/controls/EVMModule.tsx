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
import {
  appendSnapshot, combineEVMRecords, deriveEVM, evFromProgress,
  groupEVMByProject, mergeHistories, rollupCustomerEVM, wouldLeaveGroupEmpty,
  type EVMSiteRecord,
} from '@/lib/evm'
import { TABLES } from '@/lib/api/entityConfigs'
import type { EVMMetrics, Project, ProjectSite, Site } from '@/types'
import { clsx } from 'clsx'

const fmt  = (n: number | null | undefined) => { const v = n ?? 0; return v >= 1e6 ? `${(v/1e6).toFixed(2)}M Ar` : `${v.toLocaleString()} Ar` }
const pct  = (n: number | null | undefined) => `${((n ?? 0)*100).toFixed(1)}%`

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

// Per-site EVM row inside a group's detail: one project = one site.
function SiteRow({ r, onSnapshot, onEdit, onDelete }: {
  r: EVMSiteRecord
  onSnapshot: (r: EVMSiteRecord) => void
  onEdit: (r: EVMSiteRecord) => void
  onDelete: (r: EVMSiteRecord) => void
}) {
  const m = deriveEVM(r.bac, r.pv, r.ev, r.ac)
  return (
    <div className="p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{r.siteKey}{r.siteName ? ` — ${r.siteName}` : ''}</p>
          <p className="text-xs text-slate-500">{r.percentComplete ?? 0}% done · Data date: {r.dataDate ?? '—'}</p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button title="Save snapshot" onClick={() => onSnapshot(r)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Camera className="w-3.5 h-3.5" /></button>
          <button title="Edit" onClick={() => onEdit(r)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
          <button title="Delete" onClick={() => onDelete(r)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-center">
        <div><p className="text-slate-400">BAC</p><p className="font-bold">{fmt(r.bac)}</p></div>
        <div><p className="text-slate-400">EV</p><p className="font-bold">{fmt(r.ev)}</p></div>
        <div><p className="text-slate-400">AC</p><p className="font-bold">{fmt(r.ac)}</p></div>
        <div><p className="text-slate-400">Benefit</p><p className={clsx('font-bold', r.po - r.ac >= 0 ? 'text-green-600' : 'text-red-600')}>{fmt(r.po - r.ac)}</p></div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs">
        <span>CPI <strong className={m.cpi >= 1 ? 'text-green-600' : 'text-red-600'}>{m.cpi.toFixed(2)}</strong></span>
        <span>SPI <strong className={m.spi >= 1 ? 'text-green-600' : 'text-amber-600'}>{m.spi.toFixed(2)}</strong></span>
        <div className="flex-1 bg-slate-200 dark:bg-slate-600 rounded-full h-1.5">
          <div className={clsx('h-1.5 rounded-full', (r.percentComplete ?? 0) > 80 ? 'bg-green-500' : 'bg-brand-500')}
            style={{ width: `${Math.min(100, r.percentComplete ?? 0)}%` }} />
        </div>
      </div>
    </div>
  )
}

export function EVMModule() {
  const { data: projectSites } = useEntity<ProjectSite>(TABLES.projectSites)
  const { data: sites } = useEntity<Site>(TABLES.sites)
  const { data: projects } = useEntity<Project>(TABLES.projects)

  // The EVM form's sitePicker (project name → site) is driven by these rows.
  const formLookup = useMemo(() => ({
    projects, project_sites: projectSites, sites,
  }), [projects, projectSites, sites])

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
    },
    undefined,
    formLookup
  )
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [hiddenSiteIds, setHiddenSiteIds] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null)

  // 1 project = 1 site (project_sites junction); resolve the site per project.
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

  // Decorate each EVM record with its site identity.
  const siteRecords: EVMSiteRecord[] = useMemo(() => evmList.map(e => {
    const site = (sitesByProject.get(e.projectId ?? '') ?? [])[0]
    return {
      recordId: e.id ?? '',
      projectName: e.projectName ?? '',
      customerName: e.customerName,
      siteKey: site?.siteId ?? e.projectName ?? '—',
      siteName: site?.name,
      dataDate: e.dataDate,
      percentComplete: e.percentComplete ?? 0,
      history: e.history ?? [],
      po: e.po ?? 0, bac: e.bac ?? 0, pv: e.pv ?? 0, ev: e.ev ?? 0, ac: e.ac ?? 0,
    }
  }), [evmList, sitesByProject])

  // Site filter: hiddenSiteIds holds the recordIds of excluded sites.
  // Default = all sites selected (empty set = nothing hidden).
  const visibleRecords = useMemo(
    () => siteRecords.filter(r => !hiddenSiteIds.has(r.recordId)),
    [siteRecords, hiddenSiteIds]
  )
  const groups = useMemo(
    () => groupEVMByProject(visibleRecords).filter(g => g.records.length > 0),
    [visibleRecords]
  )
  const combinedByGroup = useMemo(
    () => new Map(groups.map(g => [g.key, combineEVMRecords(g.records)])),
    [groups]
  )
  const rollups = useMemo(() => rollupCustomerEVM(visibleRecords), [visibleRecords])

  const selectedGroup = groups.find(g => g.key === selectedGroupKey) ?? groups[0] ?? null
  const combined = selectedGroup ? combinedByGroup.get(selectedGroup.key) : undefined

  useEffect(() => {
    if (groups.length === 0) { setSelectedGroupKey(null); return }
    if (!selectedGroupKey || !groups.some(g => g.key === selectedGroupKey)) setSelectedGroupKey(groups[0].key)
  }, [groups, selectedGroupKey])

  const toggleSite = (recordId: string) => {
    setHiddenSiteIds(prev => {
      // At least one site per group must stay visible — unchecking the last
      // checked site of a group is ignored.
      const group = groups.find(g => g.records.some(r => r.recordId === recordId))
      if (group && !prev.has(recordId) && wouldLeaveGroupEmpty(prev, group.records, recordId)) return prev
      const next = new Set(prev)
      if (next.has(recordId)) next.delete(recordId); else next.add(recordId)
      return next
    })
  }

  // Append the record's current state to `history` so the S-curve / variance
  // charts accumulate over time instead of showing a single flat point.
  const saveSnapshot = async (r: EVMSiteRecord) => {
    if (!r.recordId) return
    setSnapshotMsg(null)
    setActionError(null)
    try {
      const date = r.dataDate || new Date().toISOString().slice(0, 10)
      const next = appendSnapshot(r.history ?? [], { date, pv: r.pv ?? 0, ev: r.ev ?? 0, ac: r.ac ?? 0 })
      await update(r.recordId, { history: next })
      setSnapshotMsg(`Snapshot saved for ${r.siteKey} (${date}) — ${next.length} point${next.length === 1 ? '' : 's'} on the S-curve.`)
    } catch (err: any) {
      setActionError(err.message ?? String(err))
    }
  }

  const handleEdit = (r: EVMSiteRecord) => {
    const row = evmList.find(e => e.id === r.recordId)
    if (!row) return
    // Pre-select the site in the form's sitePicker (1 project = 1 site).
    const site = (sitesByProject.get(row.projectId ?? '') ?? [])[0]
    openEdit({ ...row, siteId: site?.id ?? '' } as EVMMetrics)
  }

  const handleDelete = async (r: EVMSiteRecord) => {
    if (!confirm(`Delete EVM record for ${r.siteKey}?`)) return
    try {
      setActionError(null)
      await remove(r.recordId)
    } catch (err: any) {
      setActionError(err.message ?? String(err))
    }
  }

  if (loading) return <p className="text-xs text-slate-500">Loading…</p>
  if (error) return <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>

  // Charts: merged history across the group's (visible) sites; fall back to
  // the summed current snapshot when no snapshots exist yet.
  const history = selectedGroup ? mergeHistories(selectedGroup.records) : []
  const snapshotDate = selectedGroup
    ? (selectedGroup.records.map(r => r.dataDate).filter(Boolean).sort().pop() ?? 'now')
    : 'now'
  const cur = combined ?? { pv: 0, ev: 0, ac: 0, cpi: 0, spi: 0, tcpi: 0, vac: 0, po: 0, bac: 0, sv: 0, cv: 0, eac: 0, etc: 0, benefit: 0, percentComplete: 0 }
  const trendData = history.length > 0
    ? history.map(h => ({ date: h.date, PV: (h.pv ?? 0) / 1e6, EV: (h.ev ?? 0) / 1e6, AC: (h.ac ?? 0) / 1e6 }))
    : [{ date: snapshotDate, PV: cur.pv / 1e6, EV: cur.ev / 1e6, AC: cur.ac / 1e6 }]
  const varianceData = history.length > 0
    ? history.map(h => ({ date: h.date, SV: ((h.ev ?? 0) - (h.pv ?? 0)) / 1e6, CV: ((h.ev ?? 0) - (h.ac ?? 0)) / 1e6 }))
    : [{ date: snapshotDate, SV: (cur.ev - cur.pv) / 1e6, CV: (cur.ev - cur.ac) / 1e6 }]

  const summaryData = groups.map(g => {
    const c = combinedByGroup.get(g.key)!
    return { name: g.projectName.split(' ').slice(0, 3).join(' '), CPI: c.cpi ?? 0, SPI: c.spi ?? 0 }
  })

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Sites of the same project name (e.g. STARLINK) combine into one card — use the <strong>site checkboxes</strong> to include or exclude each site's data (default: all included). Enter PO / BAC / PV / AC / progress % — EV = BAC × progress, and CPI, SPI, SV, CV, EAC, ETC, VAC, TCPI, Benefit (PO − AC) are computed automatically. Save a snapshot per site to build the S-curve over time.</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={openCreate}>New EVM Record</Button>
      </div>
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}
      {snapshotMsg && <p className="text-xs text-green-600 dark:text-green-400">{snapshotMsg}</p>}
      {hiddenSiteIds.size > 0 && <p className="text-xs text-slate-400">🔍 {hiddenSiteIds.size} site(s) excluded — calculations only include the checked sites.</p>}

      {groups.length === 0 ? (
        <p className="text-sm text-slate-500">
          {siteRecords.length > 0
            ? 'All sites are excluded — check at least one site checkbox to see EVM data.'
            : 'No EVM data yet — click “New EVM Record” to add the first cost/schedule snapshot.'}
        </p>
      ) : (
        <>
      {/* Project groups with per-site filter */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map(g => {
          const c = combinedByGroup.get(g.key)!
          return (
            <Card key={g.key} hover padding={false}
              onClick={() => setSelectedGroupKey(g.key)}
              className={clsx('p-4 border-2 transition-all', selectedGroup?.key === g.key
                ? 'border-brand-500 shadow-md' : 'border-transparent')}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-bold text-brand-600 dark:text-brand-400">{g.customerName}</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">{g.records.length} site{g.records.length === 1 ? '' : 's'}</span>
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{g.projectName}</p>
              {/* Site filter — per-site checkboxes, default all checked */}
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2" onClick={ev => ev.stopPropagation()}>
                {g.records.map(r => (
                  <label key={r.recordId}
                    className={clsx('flex items-center gap-1.5 text-xs cursor-pointer',
                      hiddenSiteIds.has(r.recordId) ? 'text-slate-400 line-through' : 'text-slate-600 dark:text-slate-300')}>
                    <input
                      type="checkbox"
                      checked={!hiddenSiteIds.has(r.recordId)}
                      disabled={!hiddenSiteIds.has(r.recordId) && wouldLeaveGroupEmpty(hiddenSiteIds, g.records, r.recordId)}
                      onChange={() => toggleSite(r.recordId)}
                    />
                    <span className="font-mono">{r.siteKey}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center mt-2">
                <div>
                  <p className="text-xs text-slate-400">CPI</p>
                  <p className={clsx('text-lg font-black', c.cpi >= 1 ? 'text-green-600' : 'text-red-600')}>{c.cpi.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">SPI</p>
                  <p className={clsx('text-lg font-black', c.spi >= 1 ? 'text-green-600' : 'text-amber-600')}>{c.spi.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Done</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{Math.round(c.percentComplete)}%</p>
                </div>
              </div>
              <div className="mt-3 w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
                <div className={clsx('h-1.5 rounded-full', c.percentComplete > 80 ? 'bg-green-500' : 'bg-brand-500')}
                  style={{ width: `${Math.min(100, c.percentComplete)}%` }} />
              </div>
            </Card>
          )
        })}
      </div>

      {/* Customer rollup — respects the site filter */}
      {rollups.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="section-title">Customer Rollup</h3>
            <p className="text-xs text-slate-400">Program-level EVM — all checked sites of each customer combined</p>
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

      {/* Selected group detail */}
      {selectedGroup && combined && (
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Metrics */}
        <div className="space-y-4">
          <Card className="p-4">
            <p className="section-title mb-1">{selectedGroup.projectName}</p>
            <p className="text-xs text-slate-500 mb-3">{selectedGroup.customerName} · {selectedGroup.records.length} site{selectedGroup.records.length === 1 ? '' : 's'} combined</p>

            {/* CPI / SPI / TCPI gauges */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <IndexGauge label="CPI"  value={combined.cpi}  good />
              <IndexGauge label="SPI"  value={combined.spi}  good />
              <IndexGauge label="TCPI" value={combined.tcpi} good={false} />
            </div>

            <div className="space-y-1.5">
              <EVMRow label="PO — Customer PO" value={fmt(combined.po)} subtitle="Contracted value from the customer" highlight="neutral" />
              <EVMRow label="BAC — Internal Budget" value={fmt(combined.bac)} subtitle="Our budget at completion" highlight="neutral" />
              <EVMRow label="PV — Planned Value"  value={fmt(combined.pv)}  subtitle="Work planned to date" highlight="neutral" />
              <EVMRow label="EV — Earned Value"   value={fmt(combined.ev)}  subtitle="BAC × progress % (derived)" highlight={combined.ev >= combined.pv ? 'good' : 'bad'} />
              <EVMRow label="AC — Actual Cost"    value={fmt(combined.ac)}  subtitle="Cost incurred to date" highlight="neutral" />
              <EVMRow label="Benefit" value={fmt(combined.benefit)} subtitle="PO − AC" highlight={combined.benefit >= 0 ? 'good' : 'bad'} />
              <div className="my-2 border-t border-slate-200 dark:border-slate-700" />
              <EVMRow label="SV — Schedule Variance" value={fmt(combined.sv)} subtitle="EV − PV" highlight={combined.sv >= 0 ? 'good' : 'bad'} />
              <EVMRow label="CV — Cost Variance"     value={fmt(combined.cv)} subtitle="EV − AC" highlight={combined.cv >= 0 ? 'good' : 'bad'} />
              <div className="my-2 border-t border-slate-200 dark:border-slate-700" />
              <EVMRow label="EAC — Est. at Completion" value={fmt(combined.eac)} subtitle="BAC ÷ CPI" highlight={combined.eac <= combined.bac ? 'good' : 'bad'} />
              <EVMRow label="ETC — Est. to Complete"   value={fmt(combined.etc)} subtitle="EAC − AC" highlight="neutral" />
              <EVMRow label="VAC — Variance at Compl." value={fmt(combined.vac)} subtitle="BAC − EAC" highlight={combined.vac >= 0 ? 'good' : 'bad'} />
            </div>
          </Card>

          {/* Health Interpretation */}
          <Card className="p-4">
            <p className="text-sm font-bold text-slate-900 dark:text-white mb-3">📋 Performance Interpretation</p>
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <div className={clsx('p-2 rounded-lg', combined.cpi >= 1 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400')}>
                <strong>Cost:</strong> {combined.cpi >= 1 ? `Under budget — getting ${pct(combined.cpi)} of value per Ariary spent.` : `Over budget — only getting ${pct(combined.cpi)} of value per Ariary spent.`}
              </div>
              <div className={clsx('p-2 rounded-lg', combined.spi >= 1 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400')}>
                <strong>Schedule:</strong> {combined.spi >= 1 ? `Ahead of schedule — completing ${pct(combined.spi)} of planned work.` : `Behind schedule — only ${pct(combined.spi)} of planned work done.`}
              </div>
              <div className={clsx('p-2 rounded-lg', combined.vac >= 0 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400')}>
                <strong>Forecast:</strong> {combined.vac >= 0 ? `On track to finish ${fmt(combined.vac)} under budget.` : `Forecast to exceed budget by ${fmt(Math.abs(combined.vac))}.`}
              </div>
              <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-700/50">
                <strong>TCPI {combined.tcpi.toFixed(3)}:</strong> {combined.tcpi <= 1.0 ? 'Remaining work can be completed within budget at current efficiency.' : `Must achieve ${pct(combined.tcpi)} efficiency on remaining work to meet BAC — ${combined.tcpi > 1.1 ? '⚠️ challenging' : 'feasible'}.`}
              </div>
            </div>
          </Card>
        </div>

        {/* Right: per-site breakdown + charts */}
        <div className="xl:col-span-2 space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900 dark:text-white">Sites</p>
              <p className="text-xs text-slate-400">One EVM record per site — snapshot / edit / delete per site</p>
            </div>
            <div className="mt-3 space-y-2">
              {selectedGroup.records.map(r => (
                <SiteRow key={r.recordId} r={r} onSnapshot={saveSnapshot} onEdit={handleEdit} onDelete={handleDelete} />
              ))}
            </div>
          </Card>

          <Card padding={false}>
            <div className="px-5 pt-5 pb-2">
              <h3 className="section-title">S-Curve: PV / EV / AC</h3>
              <p className="text-xs text-slate-500 mt-0.5">Cumulative values over time, all checked sites combined (M Ar)</p>
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
              <p className="text-xs text-slate-500 mt-0.5">Combined per project — target ≥ 1.00</p>
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
      )}
        </>
      )}
      {modal}
    </div>
  )
}
