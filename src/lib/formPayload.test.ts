import { describe, it, expect } from 'vitest'
import { buildPayload, stripVirtualFields } from './formPayload'
import type { FieldConfig } from '@/components/crud/EntityFormModal'

const f = (partial: Partial<FieldConfig> & { key: string }): FieldConfig => ({ label: partial.key, type: 'text', ...partial })

describe('buildPayload — number handling', () => {
  it('drops a blank number field instead of coercing it to 0', () => {
    const { payload, error } = buildPayload([f({ key: 'amount', type: 'number' })], { amount: '', name: 'X' })
    expect(error).toBeNull()
    expect(payload.amount).toBeUndefined()
    expect(payload.name).toBe('X')
  })

  it('drops undefined and null number fields', () => {
    for (const v of [undefined, null]) {
      const { payload } = buildPayload([f({ key: 'amount', type: 'number' })], { amount: v })
      expect(payload.amount).toBeUndefined()
    }
  })

  it('parses valid numbers as numbers', () => {
    const { payload, error } = buildPayload([f({ key: 'amount', type: 'number' })], { amount: '12.5' })
    expect(error).toBeNull()
    expect(payload.amount).toBe(12.5)
  })

  it('rejects non-numeric input with a per-field error and no payload', () => {
    const { payload, error } = buildPayload([f({ key: 'amount', label: 'Amount', type: 'number' })], { amount: 'abc' })
    expect(error).toBe('"Amount" must be a valid number')
    expect(payload.amount).toBe('abc') // raw value left untouched on rejection
  })

  it('rejects Infinity', () => {
    const { error } = buildPayload([f({ key: 'x', type: 'number' })], { x: '1e999' })
    expect(error).toMatch(/must be a valid number/)
  })
})

describe('buildPayload — tags, dates, passthrough', () => {
  it('parses comma-separated tags, trimming and dropping empties', () => {
    const { payload, error } = buildPayload([f({ key: 'tags', type: 'tags' })], { tags: ' 4G , 5G ,, MW ' })
    expect(error).toBeNull()
    expect(payload.tags).toEqual(['4G', '5G', 'MW'])
  })

  it('turns an empty tags field into an empty array', () => {
    const { payload } = buildPayload([f({ key: 'tags', type: 'tags' })], { tags: '' })
    expect(payload.tags).toEqual([])
  })

  it('normalizes timestamptz strings to YYYY-MM-DD', () => {
    const { payload, error } = buildPayload([f({ key: 'dueDate', type: 'date' })], { dueDate: '2026-01-05T12:00:00.000Z' })
    expect(error).toBeNull()
    expect(payload.dueDate).toBe('2026-01-05')
  })

  it('leaves non-date strings and text fields untouched', () => {
    const values = { dueDate: '2026-01-05', note: 'hello', status: 'live' }
    const { payload } = buildPayload(
      [
        f({ key: 'dueDate', type: 'date' }),
        f({ key: 'note', type: 'text' }),
        f({ key: 'status', type: 'select' }),
      ],
      values
    )
    expect(payload).toEqual(values)
  })
})

describe('buildPayload — multiSelect', () => {
  it('keeps the selected keys as an array', () => {
    const { payload, error } = buildPayload(
      [f({ key: 'siteIds', type: 'multiSelect' })],
      { siteIds: ['s1', 's2'] }
    )
    expect(error).toBeNull()
    expect(payload.siteIds).toEqual(['s1', 's2'])
  })

  it('coerces a non-array value to an empty array', () => {
    const { payload } = buildPayload([f({ key: 'siteIds', type: 'multiSelect' })], { siteIds: undefined })
    expect(payload.siteIds).toEqual([])
  })

  it('copies the array instead of aliasing the input', () => {
    const raw = ['s1']
    const { payload } = buildPayload([f({ key: 'siteIds', type: 'multiSelect' })], { siteIds: raw })
    raw.push('s2')
    expect(payload.siteIds).toEqual(['s1'])
  })
})

describe('stripVirtualFields', () => {
  const fields = [
    f({ key: 'name', type: 'text' }),
    f({ key: 'siteIds', type: 'multiSelect', virtual: true }),
    f({ key: 'status', type: 'select' }),
  ]

  it('removes virtual keys from the payload, keeping everything else', () => {
    const out = stripVirtualFields({ name: 'STARLINK', siteIds: ['s1', 's2'], status: 'in_progress' }, fields)
    expect(out).toEqual({ name: 'STARLINK', status: 'in_progress' })
  })

  it('does not mutate the input payload', () => {
    const input = { name: 'X', siteIds: ['s1'] }
    const out = stripVirtualFields(input, fields)
    expect(input.siteIds).toEqual(['s1'])
    expect(out).not.toBe(input)
  })

  it('returns the payload untouched when no field is virtual', () => {
    const out = stripVirtualFields({ name: 'X' }, [f({ key: 'name', type: 'text' })])
    expect(out).toEqual({ name: 'X' })
  })
})

describe('buildPayload — permissions matrix', () => {
  it('keeps the permission map as an object', () => {
    const { payload } = buildPayload(
      [f({ key: 'permissions', type: 'permissions' })],
      { permissions: { projects: 'edit', sites: 'view' } }
    )
    expect(payload.permissions).toEqual({ projects: 'edit', sites: 'view' })
  })

  it('normalizes a missing map to {}', () => {
    const { payload } = buildPayload([f({ key: 'permissions', type: 'permissions' })], { permissions: undefined })
    expect(payload.permissions).toEqual({})
  })
})
