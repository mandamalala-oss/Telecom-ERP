import { describe, it, expect } from 'vitest'
import { buildPayload } from './formPayload'
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
