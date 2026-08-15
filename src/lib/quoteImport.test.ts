import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseQuoteWorkbook } from './quoteImport'

function workbook(rows: Record<string, unknown>[]): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Quotes')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('parseQuoteWorkbook', () => {
  it('parses the standard Quote template columns (Designation, Qty, Unit, Unit Price)', () => {
    const buf = workbook([
      { Designation: 'Cable 4G', Qty: 2, Unit: 'm', 'Unit Price': 500 },
      { Designation: 'Antenna', Qty: 1, Unit: 'u', 'Unit Price': 120000 },
    ])
    const p = parseQuoteWorkbook(buf)
    expect(p.errors).toHaveLength(0)
    expect(p.items).toHaveLength(2)
    expect(p.items[0]).toMatchObject({ description: 'Cable 4G', quantity: 2, unit: 'm', unitPrice: 500, total: 1000 })
    expect(p.items[1]).toMatchObject({ description: 'Antenna', quantity: 1, unit: 'u', unitPrice: 120000, total: 120000 })
  })

  it('accepts Description / Quantity / Unit Price aliases', () => {
    const buf = workbook([
      { Description: 'Microwave link', Quantity: 3, Unit: 'lot', Price: 750000 },
    ])
    const p = parseQuoteWorkbook(buf)
    expect(p.errors).toHaveLength(0)
    expect(p.items[0]).toMatchObject({ description: 'Microwave link', quantity: 3, unitPrice: 750000, total: 2250000 })
  })

  it('skips fully blank rows and invalid rows, but keeps valid ones', () => {
    const buf = workbook([
      { Designation: 'Cable 4G', Qty: 2, Unit: 'm', 'Unit Price': 500 },
      { Designation: '', Qty: '', Unit: '', 'Unit Price': '' },
      { Designation: 'Bad qty', Qty: 'abc', Unit: 'm', 'Unit Price': 500 },
      { Designation: 'Bad price', Qty: 1, Unit: 'm', 'Unit Price': 'n/a' },
      { Designation: 'Rack', Qty: 1, Unit: 'u', 'Unit Price': 80000 },
    ])
    const p = parseQuoteWorkbook(buf)
    expect(p.items.map((i) => i.description)).toEqual(['Cable 4G', 'Rack'])
    expect(p.errors).toEqual([
      'Row 4: invalid Qty "abc", skipped',
      'Row 5: invalid Unit Price "n/a", skipped',
    ])
  })

  it('reports missing required columns', () => {
    const buf = workbook([{ Name: 'Cable', Amount: 500 }])
    const p = parseQuoteWorkbook(buf)
    expect(p.items).toHaveLength(0)
    expect(p.errors[0]).toContain('Missing required column(s)')
  })

  it('handles a header-only sheet gracefully', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Designation', 'Qty', 'Unit', 'Unit Price']]), 'Quotes')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const p = parseQuoteWorkbook(buf)
    expect(p.items).toHaveLength(0)
    expect(p.errors).toEqual(['No data rows found in the first sheet.'])
  })
})
