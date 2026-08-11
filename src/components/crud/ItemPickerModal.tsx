import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { makeApi } from '@/lib/api/crud'
import type { BOQItem, CatalogItem, NetworkType } from '@/types/v2'

interface Props {
  /** Catalog subset to load: 'RAN' | 'MW'. */
  networkType: NetworkType
  /** Receives the checked rows mapped to BOQ items, then the modal closes. */
  onAdd: (items: BOQItem[]) => void
  onClose: () => void
}

const lineId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `li-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const fmt = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}M Ar`
    : `${n.toLocaleString()} Ar`

/**
 * Catalog-driven item picker for BOQ create/edit: loads catalog_items for the
 * chosen network, filters client-side by code/description, multi-selects rows
 * with an inline quantity (defaulting to default_qty). The unit price is
 * READ-ONLY — pulled straight from unit_cost, never user-editable ("price is
 * fixed, only quantity is entered"). Maps checked rows to BOQItem[] on add.
 */
export function ItemPickerModal({ networkType, onAdd, onClose }: Props) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  // Catalog row id → quantity as the user typed it (string, so clearing the
  // field stays empty while typing). Absent key = unchecked. Values are
  // clamped to min 1 only when parsed for totals/adding.
  const [sel, setSel] = useState<Record<string, string>>({})

  // Fetch the catalog for this network, ordered by item_code.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSel({})
    makeApi<CatalogItem>('catalog_items')
      .list({ orderBy: 'item_code', ascending: true, filters: { networkType } })
      .then((rows) => {
        if (!cancelled) setItems(rows)
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message ?? String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [networkType])

  // ~150ms debounce is enough for a 30–50 row client-side list.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150)
    return () => clearTimeout(t)
  }, [query])

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) => i.itemCode.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
    )
  }, [items, debounced])

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  // Min 1 per the picker contract; '' or garbage parses as 1.
  const effectiveQty = (raw: string) => Math.max(1, Number(raw) || 1)
  const selectedEntries = Object.entries(sel)
    .map(([id, raw]) => ({ item: itemById.get(id), qty: effectiveQty(raw) }))
    .filter((x): x is { item: CatalogItem; qty: number } => Boolean(x.item))

  const total = selectedEntries.reduce(
    (s, { item, qty }) => s + (Number(item.unitCost) || 0) * (Number(qty) || 0),
    0
  )

  const defaultQtyOf = (item: CatalogItem) => {
    const d = Number(item.defaultQty)
    return d > 0 ? String(d) : '1'
  }
  const toggle = (item: CatalogItem, checked: boolean) =>
    setSel((prev) => {
      const next = { ...prev }
      if (checked) next[item.id] = defaultQtyOf(item)
      else delete next[item.id]
      return next
    })

  const handleAdd = () => {
    const out: BOQItem[] = selectedEntries.map(({ item, qty }) => {
      const unitCost = Number(item.unitCost) || 0
      return {
        id: lineId(),
        itemCode: item.itemCode,
        description: item.description,
        category: (item.category || 'other') as BOQItem['category'],
        unit: item.unit || 'lot',
        quantity: qty,
        unitCost,
        totalCost: unitCost * qty,
      }
    })
    onAdd(out)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add items from ${networkType} catalog`}
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Total:{' '}
            <span className="font-black text-brand-600 dark:text-brand-400 text-lg">{fmt(total)}</span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={handleAdd} disabled={selectedEntries.length === 0}>
              Add Selected ({selectedEntries.length})
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Search by code or description…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search catalog"
          />
        </div>

        {loading && <p className="text-xs text-slate-500 py-8 text-center">Loading catalog…</p>}

        {error && (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm text-red-500">{error}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setLoading(true)
                setError(null)
                makeApi<CatalogItem>('catalog_items')
                  .list({ orderBy: 'item_code', ascending: true, filters: { networkType } })
                  .then(setItems)
                  .catch((e: any) => setError(e?.message ?? String(e)))
                  .finally(() => setLoading(false))
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="text-sm text-slate-500 py-8 text-center">
            {debounced.trim()
              ? 'No catalog items match the search.'
              : `No ${networkType} catalog items yet — run the import script first.`}
          </p>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="max-h-[45vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                  <tr>
                    <th className="th w-10 text-left"><span className="sr-only">Select</span></th>
                    <th className="th text-left">Code</th>
                    <th className="th text-left">Description</th>
                    <th className="th text-left">Unit</th>
                    <th className="th text-right">Unit Cost</th>
                    <th className="th text-left">Qty</th>
                    <th className="th text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const checked = sel[item.id] !== undefined
                    const qty = sel[item.id] ?? defaultQtyOf(item)
                    const unitCost = Number(item.unitCost) || 0
                    return (
                      <tr key={item.id} className={`tr-hover ${checked ? 'bg-brand-50/60 dark:bg-brand-900/10' : ''}`}>
                        <td className="td w-10">
                          <input
                            type="checkbox"
                            aria-label={`Select ${item.itemCode}`}
                            checked={checked}
                            onChange={(e) => toggle(item, e.target.checked)}
                          />
                        </td>
                        <td className="td font-mono text-xs font-bold text-slate-600 dark:text-slate-400">{item.itemCode}</td>
                        <td className="td">
                          <p className="font-medium">{item.description}</p>
                          {item.comments && (
                            <p className="text-xs text-slate-400 truncate max-w-xs">{item.comments}</p>
                          )}
                        </td>
                        <td className="td text-xs text-slate-500">{item.unit || 'lot'}</td>
                        {/* Price is READ-ONLY: fixed from the catalog. */}
                        <td className="td text-right text-xs">{fmt(unitCost)}</td>
                        <td className="td w-24">
                          <input
                            type="number"
                            min={1}
                            className="input !py-1 text-sm w-full"
                            value={qty}
                            disabled={!checked}
                            aria-label={`Quantity for ${item.itemCode}`}
                            onChange={(e) =>
                              setSel((prev) => (checked ? { ...prev, [item.id]: e.target.value } : prev))
                            }
                          />
                        </td>
                        <td className="td text-right text-xs font-semibold">
                          {checked ? fmt(unitCost * effectiveQty(qty)) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
