import { useState, useMemo } from 'react'
import { Plus, Search, AlertTriangle, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { TABLES } from '@/lib/api/entityConfigs'
import type { InventoryItem, StockMovement, Warehouse } from '@/types'

const fmt = (n: number) => `${(n ?? 0).toLocaleString()} Ar`

const CATEGORY_LABELS: Record<string, string> = {
  antenna: 'Antenna', radio: 'Radio/RRU', router: 'Router', cable: 'Cable',
  power_equipment: 'Power', hardware: 'Hardware', tools: 'Tools', transport: 'Transport',
}

type Tab = 'stock' | 'movements' | 'warehouses'

export function InventoryModule() {
  const [tab, setTab] = useState<Tab>('stock')
  const { data: items, loading, error, openCreate, openEdit, remove, update: updateItem, modal } = useEntityCrud<InventoryItem>(TABLES.inventoryItems, 'Inventory Item')
  const { data: movements, openCreate: openCreateMovement, modal: movementModal } = useEntityCrud<StockMovement>(
    TABLES.stockMovements, 'Stock Movement', undefined, async (movement) => {
      // Keep inventory_items in sync: a logged movement is a real stock
      // change, not just a decorative history entry.
      const item = items.find(i => i.id === movement.itemId)
      if (!item) return
      const delta = movement.type === 'in' ? movement.quantity
        : movement.type === 'out' ? -movement.quantity
        : 0 // transfer/adjustment need target values, not a delta
      if (delta === 0) return
      await updateItem(item.id!, { quantity: Math.max(0, (item.quantity ?? 0) + delta) })
    }
  )
  const { data: warehouses, openCreate: openCreateWarehouse, modal: warehouseModal } = useEntityCrud<Warehouse>(TABLES.warehouses, 'Warehouse')
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [filterWh, setFilterWh] = useState('all')
  const [selected, setSelected] = useState<InventoryItem | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const filtered = useMemo(() => items.filter(item => {
    const matchSearch = (item.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (item.sku ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (item.brand ?? '').toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCat === 'all' || item.category === filterCat
    const matchWh  = filterWh === 'all' || item.warehouseId === filterWh
    return matchSearch && matchCat && matchWh
  }), [items, search, filterCat, filterWh])

  const totalValue = items.reduce((s, i) => s + (i.quantity ?? 0) * (i.unitCost ?? 0), 0)
  const lowStockItems = items.filter(i => (i.quantity ?? 0) <= (i.reorderPoint ?? 0))

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return
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
      {loading && <p className="text-xs text-slate-500">Loading…</p>}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: 'Total SKUs',    v: items.length,    color: 'text-blue-600' },
          { l: 'Total Value',   v: fmt(totalValue),           color: 'text-green-600' },
          { l: 'Low Stock',     v: lowStockItems.length,      color: lowStockItems.length > 0 ? 'text-red-600' : 'text-green-600' },
          { l: 'Warehouses',    v: warehouses.length,   color: 'text-purple-600' },
        ].map(s => (
          <Card key={s.l} className="p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{s.l}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.v}</p>
          </Card>
        ))}
      </div>

      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Low Stock Alert</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              {lowStockItems.map(i => i.name).join(', ')} — at or below reorder point.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {(['stock','movements','warehouses'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-md capitalize transition-all ${tab===t ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'}`}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'stock' && (
          <div className="flex gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…" className="input pl-9 w-48" />
            </div>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="select w-36">
              <option value="all">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filterWh} onChange={e => setFilterWh(e.target.value)} className="select w-40">
              <option value="all">All Warehouses</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <Button icon={<Plus className="w-4 h-4"/>} onClick={openCreate}>Add Item</Button>
          </div>
        )}
        {tab === 'movements' && (
          <Button icon={<Plus className="w-4 h-4"/>} onClick={openCreateMovement}>Log Movement</Button>
        )}
        {tab === 'warehouses' && (
          <Button icon={<Plus className="w-4 h-4"/>} onClick={openCreateWarehouse}>Add Warehouse</Button>
        )}
      </div>

      {tab === 'stock' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['SKU','Name','Category','Brand/Model','Qty','Reserved','Available','Reorder','Unit Cost','Warehouse','Location',''].map(h => <th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map(item => {
                  const available = (item.quantity ?? 0) - (item.reserved ?? 0)
                  const isLow = (item.quantity ?? 0) <= (item.reorderPoint ?? 0)
                  return (
                    <tr key={item.id} className="tr-hover cursor-pointer" onClick={() => setSelected(item)}>
                      <td className="td font-mono text-xs text-brand-600 dark:text-brand-400 font-bold">{item.sku}</td>
                      <td className="td font-semibold">
                        <div className="flex items-center gap-1">
                          {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                          {item.name}
                        </div>
                      </td>
                      <td className="td text-xs">{CATEGORY_LABELS[item.category] ?? item.category}</td>
                      <td className="td text-xs text-slate-500">{item.brand} {item.model}</td>
                      <td className={`td font-bold ${isLow ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>{item.quantity}</td>
                      <td className="td text-amber-600 font-semibold">{item.reserved}</td>
                      <td className={`td font-bold ${available <= 0 ? 'text-red-600' : 'text-green-600'}`}>{available}</td>
                      <td className="td text-xs text-slate-400">{item.reorderPoint}</td>
                      <td className="td text-xs">{fmt(item.unitCost)}</td>
                      <td className="td text-xs text-slate-500 whitespace-nowrap">{item.warehouseName}</td>
                      <td className="td font-mono text-xs text-slate-400">{item.location}</td>
                      <td className="td whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(item)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(item.id!)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'movements' && (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                {['Date','Item','Type','Qty','From','To','Project','By'].map(h => <th key={h} className="th">{h}</th>)}
              </tr></thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id} className="tr-hover">
                    <td className="td text-xs text-slate-500">{m.date}</td>
                    <td className="td font-semibold text-sm">{m.itemName}</td>
                    <td className="td">
                      <Badge status={m.type === 'in' ? 'active' : m.type === 'out' ? 'rejected' : 'sent'}>
                        {m.type?.toUpperCase()}
                      </Badge>
                    </td>
                    <td className={`td font-bold ${m.type === 'in' ? 'text-green-600' : m.type === 'out' ? 'text-red-600' : 'text-blue-600'}`}>
                      {m.type === 'in' ? '+' : m.type === 'out' ? '-' : '↔'}{m.quantity}
                    </td>
                    <td className="td text-xs text-slate-500">{m.fromWarehouse ?? '—'}</td>
                    <td className="td text-xs text-slate-500">{m.toWarehouse ?? '—'}</td>
                    <td className="td text-xs text-brand-600 dark:text-brand-400">{m.projectName ?? '—'}</td>
                    <td className="td text-xs text-slate-500">{m.performedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'warehouses' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {warehouses.map(wh => {
            const whItems = items.filter(i => i.warehouseId === wh.id)
            const value = whItems.reduce((s, i) => s + (i.quantity ?? 0) * (i.unitCost ?? 0), 0)
            return (
              <Card key={wh.id} className="p-5 space-y-4">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{wh.name}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">📍 {wh.city}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Manager: {wh.manager}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                  <div>
                    <p className="text-xs text-slate-400">SKUs</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{whItems.length}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Total Value</p>
                    <p className="text-sm font-bold text-green-600">{fmt(value)}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {whItems.slice(0,4).map(i => (
                    <div key={i.id} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400 truncate flex-1 pr-2">{i.name}</span>
                      <span className={`font-bold ${(i.quantity ?? 0) <= (i.reorderPoint ?? 0) ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>{i.quantity} {i.unit}</span>
                    </div>
                  ))}
                  {whItems.length > 4 && <p className="text-xs text-slate-400">+{whItems.length - 4} more items</p>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Item Detail */}
      {selected && (
        <Modal open title={selected.name} onClose={() => setSelected(null)} size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(selected.id!)}>Delete</Button>
              <Button icon={<Pencil className="w-4 h-4" />} onClick={() => { openEdit(selected); setSelected(null) }}>Edit</Button>
            </div>
          }>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { l: 'SKU',       v: selected.sku },
              { l: 'Category',  v: CATEGORY_LABELS[selected.category] },
              { l: 'Brand',     v: selected.brand },
              { l: 'Model',     v: selected.model },
              { l: 'In Stock',  v: `${selected.quantity} ${selected.unit}` },
              { l: 'Reserved',  v: `${selected.reserved} ${selected.unit}` },
              { l: 'Available', v: `${(selected.quantity ?? 0) - (selected.reserved ?? 0)} ${selected.unit}` },
              { l: 'Reorder Pt',v: `${selected.reorderPoint} ${selected.unit}` },
              { l: 'Unit Cost', v: fmt(selected.unitCost) },
              { l: 'Total Value',v: fmt((selected.quantity ?? 0) * (selected.unitCost ?? 0)) },
              { l: 'Warehouse', v: selected.warehouseName },
              { l: 'Location',  v: selected.location },
            ].map(item => (
              <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{item.v}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {modal}
      {movementModal}
      {warehouseModal}
    </div>
  )
}
