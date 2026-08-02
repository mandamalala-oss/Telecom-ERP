import { describe, it, expect } from 'vitest'
import { toCamel, toSnake, keysToCamel, keysToSnake } from './case'

describe('toCamel / toSnake', () => {
  it('converts snake_case to camelCase', () => {
    expect(toCamel('created_at')).toBe('createdAt')
    expect(toCamel('site_id')).toBe('siteId')
    expect(toCamel('boq_number')).toBe('boqNumber')
    expect(toCamel('plain')).toBe('plain')
  })

  it('converts camelCase to snake_case', () => {
    expect(toSnake('createdAt')).toBe('created_at')
    expect(toSnake('siteId')).toBe('site_id')
    expect(toSnake('scopeOfWork')).toBe('scope_of_work')
    expect(toSnake('plain')).toBe('plain')
  })

  it('round-trips both directions', () => {
    const cases = ['created_at', 'site_id', 'boq_number', 'is_primary', 'expected_close', 'scope_of_work']
    for (const s of cases) {
      expect(toSnake(toCamel(s))).toBe(s)
    }
  })
})

describe('keysToCamel', () => {
  it('recursively converts object keys', () => {
    const out = keysToCamel({ site_id: 1, customer_name: 'ACME', nested: { line_items: [1] } })
    expect(out).toEqual({ siteId: 1, customerName: 'ACME', nested: { lineItems: [1] } })
  })

  it('maps arrays element-wise', () => {
    expect(keysToCamel([{ a_b: 1 }, { a_b: 2 }])).toEqual([{ aB: 1 }, { aB: 2 }])
  })

  it('passes through non-objects untouched', () => {
    expect(keysToCamel(null)).toBeNull()
    expect(keysToCamel(42)).toBe(42)
    expect(keysToCamel('x')).toBe('x')
  })

  it('leaves Dates untouched', () => {
    const d = new Date('2026-01-01T00:00:00Z')
    expect(keysToCamel({ when: d })).toEqual({ when: d })
  })
})

describe('keysToSnake', () => {
  it('converts top-level keys only — keeps JSONB payload shapes intact', () => {
    // JSONB payloads (line items, ATP results…) hold free-form keys; the
    // conversion must not mangle their inner object keys.
    const payload = {
      lineItems: [{ sku: 'A', qty: 2, 'custom key': true }],
      totalCost: 100,
    }
    expect(keysToSnake(payload)).toEqual({
      line_items: [{ sku: 'A', qty: 2, 'custom key': true }],
      total_cost: 100,
    })
  })

  it('round-trips a full row through camel and back', () => {
    const row = { created_at: '2026-01-01', site_count: 4, is_primary: true }
    const camel = keysToCamel(row)
    expect(camel).toEqual({ createdAt: '2026-01-01', siteCount: 4, isPrimary: true })
    expect(keysToSnake(camel)).toEqual(row)
  })
})
