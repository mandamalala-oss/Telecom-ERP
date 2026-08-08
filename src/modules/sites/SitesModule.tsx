import { useState, useMemo } from 'react'
import { Plus, Search, MapPin, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { TABLES } from '@/lib/api/entityConfigs'
import type { Site, SiteStatus, Technology } from '@/types'

const ALL_STATUSES: SiteStatus[] = ['planned','survey','installation','integration','atp','acceptance','live','decommissioned']
const ALL_TECHS: Technology[] = ['2G','3G','4G','4G+','5G','MW','VSAT']

const fmt = (n: number | null | undefined) => {
  const v = n ?? 0
  return v >= 1e6 ? `${(v/1e6).toFixed(1)}M Ar` : `${v.toLocaleString()} Ar`
}

const fmtKm = (n: number | null | undefined) => {
  const v = n ?? 0
  return v > 0 ? `${v.toLocaleString()} km` : '—'
}

type ViewMode = 'table' | 'grid'

export function SitesModule() {
  const { data: sites, loading, error, openCreate, openEdit, remove, modal } = useEntityCrud<Site>(TABLES.sites, 'Site')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterTech, setFilterTech] = useState<string>('all')
  const [filterRegion, setFilterRegion] = useState<string>('all')
  const [view, setView] = useState<ViewMode>('table')
  const [selected, setSelected] = useState<Site | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const filtered = useMemo(() => sites.filter(s => {
    const matchSearch = (s.siteId ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || s.status === filterStatus
    const matchTech   = filterTech === 'all' || (s.technology ?? []).includes(filterTech as Technology)
    const matchRegion = filterRegion === 'all' || s.region === filterRegion
    return matchSearch && matchStatus && matchTech && matchRegion
  }), [sites, search, filterStatus, filterTech, filterRegion])

  const regions = [...new Set(sites.map(s => s.region))]

  const statusCounts = ALL_STATUSES.map(st => ({
    status: st, count: sites.filter(s => s.status === st).length,
  })).filter(s => s.count > 0)

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this site?')) return
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
      {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>}
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilterStatus('all')}
          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${filterStatus==='all' ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-400'}`}>
          All ({sites.length})
        </button>
        {statusCounts.map(({ status, count }) => (
          <button key={status} onClick={() => setFilterStatus(status)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${filterStatus===status ? 'bg-brand-600 text-white border-brand-600' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-brand-400'}`}>
            {status.replace('_',' ')} ({count})
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Site ID, name…" className="input pl-9 w-full" />
        </div>
        <select value={filterTech} onChange={e => setFilterTech(e.target.value)} className="select w-32">
          <option value="all">All Tech</option>
          {ALL_TECHS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} className="select w-40">
          <option value="all">All Regions</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {(['table','grid'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1 text-xs font-semibold rounded capitalize transition-all ${view===v ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>
              {v}
            </button>
          ))}
        </div>
        <Button icon={<Plus className="w-4 h-4"/>} onClick={openCreate}>New Site</Button>
      </div>

      <p className="text-xs text-slate-500">{loading ? 'Loading…' : `${filtered.length} site${filtered.length !== 1 ? 's' : ''} shown`}</p>

      {view === 'table' ? (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['Site ID','Name','Region','Technology','Status','Priority','Tower','Power','Distance','Revenue','Coordinates',''].map(h => <th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="tr-hover cursor-pointer" onClick={() => setSelected(s)}>
                    <td className="td font-mono text-xs font-bold text-brand-600 dark:text-brand-400 whitespace-nowrap">{s.siteId}</td>
                    <td className="td font-semibold whitespace-nowrap">{s.name}</td>
                    <td className="td whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span className="text-xs">{s.region}</span>
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {(s.technology ?? []).map(t => <Badge key={t} status={t}>{t}</Badge>)}
                      </div>
                    </td>
                    <td className="td"><Badge status={s.status} /></td>
                    <td className="td"><Badge status={s.priority} /></td>
                    <td className="td text-xs capitalize text-slate-500">{s.towerType?.replace('_',' ')}</td>
                    <td className="td text-xs capitalize text-slate-500">{s.powerSource}</td>
                    <td className="td text-xs text-slate-500 whitespace-nowrap">{fmtKm(s.distanceKm)}</td>
                    <td className="td text-xs font-semibold text-green-600 whitespace-nowrap">{fmt(s.revenue)}</td>
                    <td className="td font-mono text-xs text-slate-400 whitespace-nowrap">
                      {s.latitude?.toFixed?.(4)}, {s.longitude?.toFixed?.(4)}
                    </td>
                    <td className="td whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(s.id!)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(s => (
            <Card key={s.id} hover padding={false} onClick={() => setSelected(s)} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{s.siteId}</p>
                  <p className="font-bold text-slate-900 dark:text-white mt-0.5">{s.name}</p>
                </div>
                <Badge status={s.status} />
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500 mb-2">
                <MapPin className="w-3 h-3" />{s.region} · {s.latitude?.toFixed?.(3)}, {s.longitude?.toFixed?.(3)}
              </div>
              <p className="text-xs text-slate-500 mb-2">{s.region}</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {(s.technology ?? []).map(t => <Badge key={t} status={t}>{t}</Badge>)}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 text-xs">
                <div><p className="text-slate-400">Tower</p><p className="font-semibold capitalize text-slate-700 dark:text-slate-300">{s.towerType?.replace('_',' ')}</p></div>
                <div><p className="text-slate-400">Power</p><p className="font-semibold capitalize text-slate-700 dark:text-slate-300">{s.powerSource}</p></div>
                <div><p className="text-slate-400">Priority</p><Badge status={s.priority} /></div>
                <div><p className="text-slate-400">Distance</p><p className="font-semibold text-slate-700 dark:text-slate-300">{fmtKm(s.distanceKm)}</p></div>
                <div><p className="text-slate-400">Revenue</p><p className="font-semibold text-green-600">{fmt(s.revenue)}</p></div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Site Detail */}
      {selected && (
        <Modal open title={`${selected.siteId} — ${selected.name}`} onClose={() => setSelected(null)} size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(selected.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { openEdit(selected); setSelected(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { l: 'Site ID',   v: selected.siteId },
                { l: 'Region',    v: selected.region },
                { l: 'Customer',  v: selected.customerName ?? '—' },
                { l: 'Status',    v: <Badge status={selected.status} /> },
                { l: 'Latitude',  v: selected.latitude?.toFixed?.(6) },
                { l: 'Longitude', v: selected.longitude?.toFixed?.(6) },
                { l: 'Altitude',  v: selected.altitude ? `${selected.altitude}m ASL` : '—' },
                { l: 'Priority',  v: <Badge status={selected.priority} /> },
                { l: 'Tower Type',    v: selected.towerType?.replace('_',' ') },
                { l: 'Power Source',  v: selected.powerSource },
                { l: 'Access',        v: selected.accessType },
                { l: 'Distance',      v: fmtKm(selected.distanceKm) },
                { l: 'Transmission',  v: selected.transmissionType ?? '—' },
                { l: 'Transport',     v: (selected.meansOfTransport ?? []).length > 0 ? `${selected.meansOfTransport!.join(', ')}${selected.transportLengthKm ? ` · ${fmtKm(selected.transportLengthKm)}` : ''}` : '—' },
                { l: 'Walk from 4x4', v: fmtKm(selected.walkDistanceKm) },
                { l: 'Revenue',       v: fmt(selected.revenue) },
                { l: 'Last Updated',  v: selected.updatedAt },
              ].map(item => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 capitalize">{item.v}</div>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Technologies</p>
              <div className="flex flex-wrap gap-2">
                {(selected.technology ?? []).map(t => <Badge key={t} status={t} className="text-sm px-3 py-1">{t}</Badge>)}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" /> GPS Location
              </p>
              <p className="font-mono text-sm text-slate-900 dark:text-white">
                {selected.latitude?.toFixed?.(6)}°, {selected.longitude?.toFixed?.(6)}°
              </p>
              <a href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`}
                target="_blank" rel="noreferrer"
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline mt-1 inline-block">
                Open in Google Maps →
              </a>
            </div>
            {selected.notes && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">{selected.notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      {modal}
    </div>
  )
}
