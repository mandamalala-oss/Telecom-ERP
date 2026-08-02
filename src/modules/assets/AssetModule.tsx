import { useState } from 'react'
import { Search, Plus, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { TABLES } from '@/lib/api/entityConfigs'
import type { Asset } from '@/types/v2'
import { clsx } from 'clsx'

const STATUS_COLOR: Record<string, string> = {
  in_warehouse:'bg-blue-100 text-blue-700', reserved:'bg-purple-100 text-purple-700',
  in_transit:'bg-amber-100 text-amber-700', on_vehicle:'bg-orange-100 text-orange-700',
  on_site:'bg-cyan-100 text-cyan-700', installed:'bg-green-100 text-green-700',
  defective:'bg-red-100 text-red-700', under_repair:'bg-amber-100 text-amber-700',
  decommissioned:'bg-slate-100 text-slate-500',
}

const fmt = (n?: number) => n ? `${n.toLocaleString()} Ar` : '—'

export function AssetModule() {
  const { data: assets, loading, error, openCreate, openEdit, remove, modal } = useEntityCrud<Asset>(TABLES.assets, 'Asset')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selAsset, setSelAsset] = useState<Asset | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const filtered = assets.filter(a => {
    const q = search.toLowerCase()
    return ((a.serialNumber??'').toLowerCase().includes(q) || (a.assetTag??'').toLowerCase().includes(q) || (a.model??'').toLowerCase().includes(q) || (a.brand??'').toLowerCase().includes(q)) &&
      (filterStatus === 'all' || a.status === filterStatus)
  })

  const totalValue = assets.reduce((s, a) => s + (a.purchaseCost ?? 0), 0)

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this asset?')) return
    try {
      setActionError(null)
      await remove(id)
      setSelAsset(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: 'Total Assets',  v: assets.length,                                          color: 'text-blue-600' },
          { l: 'Installed',     v: assets.filter(a => a.status === 'installed').length,     color: 'text-green-600' },
          { l: 'In Warehouse',  v: assets.filter(a => a.status === 'in_warehouse').length,  color: 'text-purple-600' },
          { l: 'Total Value',   v: `${(totalValue/1e6).toFixed(1)}M Ar`,                        color: 'text-amber-600' },
        ].map(s => (
          <Card key={s.l} className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.l}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.v}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Serial, tag, model…" className="input pl-9 w-56"/>
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="select w-40">
            <option value="all">All Status</option>
            {Object.keys(STATUS_COLOR).map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
        </div>
        <Button icon={<Plus className="w-4 h-4"/>} onClick={openCreate}>Register Asset</Button>
      </div>
      {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>}
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}
      {loading && <p className="text-xs text-slate-500">Loading…</p>}

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              {['Asset Tag','Serial #','Category','Brand / Model','Status','Condition','Location','Warranty','Cost',''].map(h => <th key={h} className="th">{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.map(asset => (
                <tr key={asset.id} className="tr-hover cursor-pointer" onClick={() => setSelAsset(asset)}>
                  <td className="td font-mono text-xs font-bold text-brand-600">{asset.assetTag}</td>
                  <td className="td font-mono text-xs">{asset.serialNumber}</td>
                  <td className="td text-xs capitalize">{asset.category}</td>
                  <td className="td"><p className="font-semibold text-sm">{asset.brand} {asset.model}</p><p className="text-xs text-slate-400">{asset.description}</p></td>
                  <td className="td">
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold capitalize dark:bg-opacity-20', STATUS_COLOR[asset.status]??'bg-slate-100 text-slate-600')}>
                      {asset.status.replace('_',' ')}
                    </span>
                  </td>
                  <td className="td text-xs capitalize text-slate-500">{asset.condition}</td>
                  <td className="td text-xs text-slate-500 max-w-[150px] truncate">{asset.currentLocation}</td>
                  <td className="td text-xs text-slate-500">{asset.warrantyExpiry ?? '—'}</td>
                  <td className="td text-xs font-semibold">{fmt(asset.purchaseCost)}</td>
                  <td className="td whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(asset)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(asset.id!)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Asset Detail with Movement History */}
      {selAsset && (
        <Modal open title={`${selAsset.assetTag} — ${selAsset.brand} ${selAsset.model}`} onClose={() => setSelAsset(null)} size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(selAsset.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { openEdit(selAsset); setSelAsset(null) }}>Edit</Button>
            </div>
          }>
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {l:'Asset Tag',    v:selAsset.assetTag},
                {l:'Serial Number',v:selAsset.serialNumber},
                {l:'Barcode',      v:selAsset.barcode},
                {l:'Category',     v:selAsset.category},
                {l:'Brand',        v:selAsset.brand},
                {l:'Model',        v:selAsset.model},
                {l:'Condition',    v:selAsset.condition},
                {l:'Purchase Date',v:selAsset.purchaseDate??'—'},
                {l:'Purchase Cost',v:fmt(selAsset.purchaseCost)},
                {l:'Warranty Until',v:selAsset.warrantyExpiry??'—'},
                {l:'Supplier',     v:selAsset.supplierName??'—'},
                {l:'PO Number',    v:selAsset.poNumber??'—'},
              ].map(item => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 capitalize">{item.v}</p>
                </div>
              ))}
            </div>

            <div className={clsx('rounded-xl p-4 border-2', selAsset.status === 'installed' ? 'border-green-300 bg-green-50 dark:bg-green-900/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30')}>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Current Location</p>
              <p className="text-lg font-black text-slate-900 dark:text-white">{selAsset.currentLocation}</p>
              <span className={clsx('text-xs px-2 py-0.5 rounded-full font-bold capitalize mt-1 inline-block', STATUS_COLOR[selAsset.status]??'')}>{selAsset.status.replace('_',' ')}</span>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Movement History ({(selAsset.movements??[]).length})</p>
              {(selAsset.movements??[]).length === 0 ? <p className="text-sm text-slate-400">No movements recorded.</p>
                : (
                  <div className="relative pl-4">
                    <div className="absolute left-1.5 top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-700" />
                    {(selAsset.movements??[]).map((mv, i) => (
                      <div key={mv.id} className="flex gap-3 mb-4 relative">
                        <div className="absolute -left-3 w-3 h-3 rounded-full bg-brand-500 mt-1 flex-shrink-0 z-10" />
                        <div className="ml-3 flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white">{mv.from} → {mv.to}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{mv.reason}</p>
                              {mv.projectId && <p className="text-xs text-brand-600">Project: {mv.projectId}</p>}
                            </div>
                            <p className="text-xs text-slate-400 flex-shrink-0 ml-2">{mv.movedAt}</p>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">By: {mv.movedBy}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </Modal>
      )}

      {modal}
    </div>
  )
}
