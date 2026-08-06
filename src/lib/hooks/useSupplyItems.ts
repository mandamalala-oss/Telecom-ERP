import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { keysToCamel, keysToSnake } from '@/lib/api/case'
import type { SupplyItem } from '@/types'

/** Client-side computed totals for a supply line. */
export function supplyLineTotals(i: Pick<SupplyItem, 'qty' | 'purchasePrice' | 'sellingPrice'>): Pick<SupplyItem, 'totalSelling' | 'totalCost' | 'margin'> {
  const qty = Number(i.qty) || 0
  const purchase = Number(i.purchasePrice) || 0
  const selling = Number(i.sellingPrice) || 0
  return {
    totalSelling: qty * selling,
    totalCost: qty * purchase,
    margin: qty * (selling - purchase),
  }
}

/** Sum totals across supply lines. */
export function supplyTotals(rows: SupplyItem[]) {
  return rows.reduce(
    (t, r) => {
      const { totalSelling, totalCost } = supplyLineTotals(r)
      return { cost: t.cost + (totalCost ?? 0), selling: t.selling + (totalSelling ?? 0) }
    },
    { cost: 0, selling: 0 }
  )
}

/**
 * Loads / replaces the goods lines of a supply project (project_supply_items).
 * `save` takes the project id explicitly so it also works right after the
 * project row is created.
 */
export function useSupplyItems(projectId?: string) {
  const [items, setItems] = useState<SupplyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!projectId) {
      setItems([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('project_supply_items')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
      if (error) throw error
      setItems((data ?? []).map((r: any) => {
        const camel = keysToCamel<SupplyItem>(r)
        return { ...camel, ...supplyLineTotals(camel) }
      }))
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** Replace a project's goods lines (delete-all + insert, like syncSites). */
  const save = useCallback(async (targetProjectId: string, rows: SupplyItem[]) => {
    const clean = rows.filter(
      (r) => String(r.description ?? '').trim() !== '' || String(r.code ?? '').trim() !== ''
    )
    const { error: del } = await supabase.from('project_supply_items').delete().eq('project_id', targetProjectId)
    if (del) throw del
    if (clean.length > 0) {
      const { error: ins } = await supabase.from('project_supply_items').insert(
        clean.map((r) =>
          keysToSnake({
            projectId: targetProjectId,
            code: String(r.code ?? '').trim() || null,
            description: String(r.description ?? '').trim(),
            unit: String(r.unit ?? '').trim() || 'U',
            qty: Number(r.qty) || 0,
            purchasePrice: Number(r.purchasePrice) || 0,
            sellingPrice: Number(r.sellingPrice) || 0,
          })
        )
      )
      if (ins) throw ins
    }
    if (targetProjectId === projectId) await refresh()
  }, [projectId, refresh])

  return { items, loading, error, refresh, save }
}
