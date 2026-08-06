// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { useSupplyItems, supplyLineTotals, supplyTotals } from './useSupplyItems'

// Minimal chainable Supabase query builder recording each call.
type Step = [method: string, ...args: unknown[]]
function builder(result: { data?: unknown; error?: unknown } = {}) {
  const steps: Step[] = []
  const chain: any = new Proxy(
    { data: undefined, error: undefined },
    {
      get(target, prop: string) {
        if (prop === 'then') return undefined // not a thenable
        if (prop === 'data') return result.data
        if (prop === 'error') return result.error
        return (...args: unknown[]) => {
          steps.push([prop, ...args])
          return chain
        }
      },
    }
  )
  return { chain, steps }
}

const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }))

const row = (over: Record<string, any> = {}) => ({
  id: 'i1',
  project_id: 'p1',
  code: 'CBL-001',
  description: 'Cable 4G',
  unit: 'm',
  qty: 2,
  purchase_price: 100,
  selling_price: 300,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('useSupplyItems', () => {
  it('loads items for a project with computed totals', async () => {
    const { chain } = builder({ data: [row()] })
    mocks.from.mockReturnValue(chain)

    const { result } = renderHook(() => useSupplyItems('p1'))
    await waitFor(() => expect(result.current.items).toHaveLength(1))
    const item = result.current.items[0]
    expect(item.description).toBe('Cable 4G')
    expect(item.totalCost).toBe(200) // 2 × 100
    expect(item.totalSelling).toBe(600) // 2 × 300
    expect(item.margin).toBe(400)
    expect(mocks.from).toHaveBeenCalledWith('project_supply_items')
  })

  it('saves by deleting then inserting the cleaned rows', async () => {
    // One chain: resolves select with the row, delete/insert with null.
    const calls: Step[] = []
    const resolver = (resolve: (v: unknown) => void) =>
      resolve(calls[0]?.[0] === 'select' ? { data: [row()], error: null } : { data: null, error: null })
    const chain: any = new Proxy({ then: resolver }, {
      get(target, prop: string) {
        if (prop === 'then') return target.then
        return (...args: unknown[]) => {
          calls.push([prop, ...args])
          return chain
        }
      },
    })
    mocks.from.mockReturnValue(chain)

    const { result } = renderHook(() => useSupplyItems('p1'))
    await result.current.save('p1', [
      { id: 'x', description: 'Tower', unit: 'u', qty: 1, purchasePrice: 500, sellingPrice: 900 },
      { id: 'y', description: '   ', unit: '', qty: 0, purchasePrice: 0, sellingPrice: 0 }, // dropped
    ])

    expect(calls.some((c) => c[0] === 'delete')).toBe(true)
    const insertCall = calls.find((c) => c[0] === 'insert')
    expect(insertCall![1]).toEqual([
      { project_id: 'p1', code: null, description: 'Tower', unit: 'u', qty: 1, purchase_price: 500, selling_price: 900 },
    ])
  })

  it('has no items when there is no project id', async () => {
    const { result } = renderHook(() => useSupplyItems(undefined))
    expect(result.current.items).toEqual([])
    expect(mocks.from).not.toHaveBeenCalled()
  })
})

describe('supplyTotals', () => {
  it('sums cost and selling across lines', () => {
    const t = supplyTotals([
      { description: 'a', unit: 'u', qty: 2, purchasePrice: 100, sellingPrice: 300 },
      { description: 'b', unit: 'u', qty: 3, purchasePrice: 50, sellingPrice: 80 },
    ])
    expect(t).toEqual({ cost: 2 * 100 + 3 * 50, selling: 2 * 300 + 3 * 80 })
  })

  it('line totals use the same arithmetic as the hook', () => {
    expect(supplyLineTotals({ qty: 4, purchasePrice: 250, sellingPrice: 400 })).toEqual({
      totalSelling: 1600,
      totalCost: 1000,
      margin: 600,
    })
  })
})
