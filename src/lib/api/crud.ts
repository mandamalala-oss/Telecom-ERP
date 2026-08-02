import { supabase } from '@/lib/supabase'
import { keysToCamel, keysToSnake } from './case'

export interface ListOptions {
  orderBy?: string
  ascending?: boolean
  filters?: Record<string, unknown>
  limit?: number
}

// Generic, typed-by-caller CRUD helpers over a single Supabase table.
// Every module uses these instead of hand-rolled fetch logic, so the
// whole app talks to Supabase the same way.
export function makeApi<T extends { id?: string }>(table: string) {
  return {
    async list(opts: ListOptions = {}): Promise<T[]> {
      const run = async (withOrder: boolean) => {
        let query = supabase.from(table).select('*')
        if (opts.filters) {
          for (const [k, v] of Object.entries(opts.filters)) {
            if (v !== undefined && v !== null && v !== '') query = query.eq(toSnakeKey(k), v as any)
          }
        }
        if (withOrder) {
          query = query.order(toSnakeKey(opts.orderBy ?? 'created_at'), { ascending: opts.ascending ?? false })
        }
        if (opts.limit) query = query.limit(opts.limit)
        const { data, error } = await query
        if (error) throw error
        return keysToCamel<T[]>(data ?? [])
      }
      try {
        return await run(true)
      } catch (e: any) {
        // Some tables have no created_at column (e.g. evm_metrics, employees,
        // documents) — PostgREST rejects the default ordering with a 400.
        // Retry once without ordering; the schema now adds created_at to all
        // tables, so this only kicks in for stale deployments.
        if (opts.orderBy || !/could not find/i.test(String(e?.message ?? ''))) throw e
        return run(false)
      }
    },

    async get(id: string): Promise<T | null> {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data ? keysToCamel<T>(data) : null
    },

    async create(payload: Partial<T>): Promise<T> {
      const row = keysToSnake(stripEmpty(payload))
      const { data, error } = await supabase.from(table).insert(row).select().single()
      if (error) throw error
      return keysToCamel<T>(data)
    },

    async update(id: string, payload: Partial<T>): Promise<T> {
      const row = keysToSnake(stripEmpty(payload))
      const { data, error } = await supabase.from(table).update(row).eq('id', id).select().single()
      if (error) throw error
      return keysToCamel<T>(data)
    },

    async remove(id: string): Promise<void> {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
    },
  }
}

function toSnakeKey(k: string) {
  return k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

// Never send `id: ''` or `undefined` fields on create/update — let DB defaults apply.
function stripEmpty<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    if (k === 'id' && (v === '' || v === undefined)) continue
    out[k] = v
  }
  return out as T
}
