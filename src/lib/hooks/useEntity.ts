import { useCallback, useEffect, useState } from 'react'
import { makeApi, type ListOptions } from '@/lib/api/crud'

// One hook, used by every module: real Supabase-backed list + CRUD state.
export function useEntity<T extends { id?: string }>(table: string, opts: ListOptions = {}) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const api = makeApi<T>(table)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await api.list(opts)
      setData(rows)
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, JSON.stringify(opts)])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = useCallback(async (payload: Partial<T>) => {
    const row = await api.create(payload)
    setData((prev) => [row, ...prev])
    return row
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table])

  const update = useCallback(async (id: string, payload: Partial<T>) => {
    const row = await api.update(id, payload)
    setData((prev) => prev.map((r) => (r.id === id ? row : r)))
    return row
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table])

  const remove = useCallback(async (id: string) => {
    await api.remove(id)
    setData((prev) => prev.filter((r) => r.id !== id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table])

  return { data, loading, error, refresh, create, update, remove }
}
