import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeApi } from './crud'

// Replace the Supabase client with a scripted query-builder double so the
// CRUD layer can be tested without a network or env vars.
const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from },
}))

interface BuilderOpts {
  data?: unknown
  error?: unknown
  /** When set, calling .order() poisons the query with a "could not find" error (PostgREST 400 on missing created_at). */
  failOrder?: boolean
}

type QueryCall = [string, ...unknown[]]
/** Narrow view of the builder used for assertions. */
interface ChainView {
  calls: QueryCall[]
}

/** Minimal chainable PostgREST builder: methods record calls and return `this`; awaiting it yields { data, error }. */
function queryBuilder(opts: BuilderOpts = {}) {
  const state = { data: opts.data ?? null, error: opts.error ?? null }
  const calls: Array<QueryCall> = []
  const chain: Record<string, any> = {
    calls,
    get data() {
      return state.data
    },
    get error() {
      return state.error
    },
  }
  const step =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args])
      if (name === 'order' && opts.failOrder) {
        state.error = { message: `could not find the column ${String(args[0])} in the schema cache` }
      }
      return chain
    }
  chain.select = step('select')
  chain.eq = step('eq')
  chain.order = step('order')
  chain.limit = step('limit')
  chain.insert = step('insert')
  chain.update = step('update')
  chain.delete = step('delete')
  chain.maybeSingle = () => ({ data: state.data, error: state.error })
  chain.single = () => ({ data: state.data, error: state.error })
  return chain
}

beforeEach(() => {
  mocks.from.mockReset()
})

describe('makeApi().list', () => {
  it('defaults to order by created_at descending', async () => {
    mocks.from.mockImplementation(() =>
      queryBuilder({ data: [{ created_at: '2026-01-01', site_count: 2 }] })
    )
    const rows = await makeApi<any>('sites').list()
    const b = mocks.from.mock.results[0].value as ChainView
    expect(b.calls).toContainEqual(['order', 'created_at', { ascending: false }])
    // rows come back camelCased
    expect(rows).toEqual([{ createdAt: '2026-01-01', siteCount: 2 }])
  })

  it('applies the requested order and direction', async () => {
    mocks.from.mockImplementation(() => queryBuilder({ data: [] }))
    await makeApi<any>('leads').list({ orderBy: 'company', ascending: true })
    const b = mocks.from.mock.results[0].value as ChainView
    expect(b.calls).toContainEqual(['order', 'company', { ascending: true }])
  })

  it('skips null / empty / undefined filters', async () => {
    mocks.from.mockImplementation(() => queryBuilder({ data: [] }))
    await makeApi<any>('leads').list({ filters: { status: 'new', notes: null, email: '', tag: undefined } })
    const b = mocks.from.mock.results[0].value as ChainView
    expect(b.calls).toContainEqual(['eq', 'status', 'new'])
    expect(b.calls.filter((c) => c[0] === 'eq')).toHaveLength(1)
  })

  it('snake_cases filter keys', async () => {
    mocks.from.mockImplementation(() => queryBuilder({ data: [] }))
    await makeApi<any>('sites').list({ filters: { siteId: 'MDG-001' } })
    const b = mocks.from.mock.results[0].value as ChainView
    expect(b.calls).toContainEqual(['eq', 'site_id', 'MDG-001'])
  })

  it('retries without ordering when created_at ordering fails (stale deployments)', async () => {
    mocks.from.mockImplementation(() => queryBuilder({ data: [{ id: '1', name: 'A' }], failOrder: true }))
    const rows = await makeApi<any>('employees').list()
    expect(rows).toEqual([{ id: '1', name: 'A' }])
    const results = mocks.from.mock.results
    const last = results[results.length - 1].value as ChainView
    expect(last.calls.some((c) => c[0] === 'order')).toBe(false)
  })

  it('rethrows non-"could not find" errors', async () => {
    mocks.from.mockImplementation(() => queryBuilder({ error: { message: 'network error' } }))
    await expect(makeApi<any>('sites').list()).rejects.toThrow('network error')
  })

  it('rethrows ordering failures when an explicit orderBy was requested', async () => {
    mocks.from.mockImplementation(() => queryBuilder({ data: [], failOrder: true }))
    await expect(makeApi<any>('sites').list({ orderBy: 'name' })).rejects.toThrow(/could not find/)
  })
})

describe('makeApi().get / create / update / remove', () => {
  it('get: selects by id and camel_cases the row', async () => {
    mocks.from.mockImplementation(() => queryBuilder({ data: { id: '1', first_name: 'A', is_primary: true } }))
    const row = await makeApi<any>('contacts').get('1')
    const b = mocks.from.mock.results[0].value as ChainView
    expect(b.calls).toContainEqual(['eq', 'id', '1'])
    expect(row).toEqual({ id: '1', firstName: 'A', isPrimary: true })
  })

  it('get: returns null when no row matches', async () => {
    mocks.from.mockImplementation(() => queryBuilder({ data: null }))
    expect(await makeApi<any>('contacts').get('missing')).toBeNull()
  })

  it('create: strips empty id / undefined fields and snake_cases the rest', async () => {
    mocks.from.mockImplementation(() => queryBuilder({ data: { id: '9' } }))
    await makeApi<any>('leads').create({ id: '', company: 'ACME', assignedTo: 'Bob', notes: undefined, value: 0 })
    const b = mocks.from.mock.results[0].value as ChainView
    expect(b.calls).toContainEqual(['insert', { company: 'ACME', assigned_to: 'Bob', value: 0 }])
    expect(b.calls.some((c) => c[0] === 'select')).toBe(true)
    expect(b.calls.some((c) => c[0] === 'eq')).toBe(false)
  })

  it('update: sends snake_cased payload and targets the id', async () => {
    mocks.from.mockImplementation(() => queryBuilder({ data: { id: '1' } }))
    await makeApi<any>('sites').update('1', { siteId: 'MDG-002', status: 'live' })
    const b = mocks.from.mock.results[0].value as ChainView
    expect(b.calls).toContainEqual(['update', { site_id: 'MDG-002', status: 'live' }])
    expect(b.calls).toContainEqual(['eq', 'id', '1'])
  })

  it('remove: deletes by id', async () => {
    mocks.from.mockImplementation(() => queryBuilder({}))
    await makeApi<any>('documents').remove('42')
    const b = mocks.from.mock.results[0].value as ChainView
    expect(b.calls).toContainEqual(['delete'])
    expect(b.calls).toContainEqual(['eq', 'id', '42'])
  })

  it('surfaces Supabase errors instead of swallowing them', async () => {
    mocks.from.mockImplementation(() => queryBuilder({ error: { message: 'insert failed' } }))
    await expect(makeApi<any>('leads').create({ company: 'X' })).rejects.toThrow('insert failed')
  })
})
