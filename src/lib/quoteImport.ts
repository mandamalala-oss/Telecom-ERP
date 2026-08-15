import * as XLSX from 'xlsx'

/**
 * Excel import for Quote line items.
 *
 * Expected workbook: first sheet, header row with the same columns as the
 * Quote line-items editor:
 *   Designation | Qty | Unit | Unit Price
 *
 * Header aliases accepted for forward/backward compatibility:
 *   Designation / Description, Qty / Quantity, Unit, Unit Price / Price.
 * Blank rows are skipped; invalid rows are reported and skipped so one bad
 * row doesn't block the rest of the file.
 */

export interface QuoteLineImportItem {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
}

export interface QuoteWorkbookParseResult {
  items: QuoteLineImportItem[]
  errors: string[]
}

const str = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim())
const norm = (v: unknown) => str(v).toLowerCase()

const HEADER_ALIASES = {
  description: ['designation', 'description'],
  quantity: ['qty', 'quantity'],
  unit: ['unit'],
  unitPrice: ['unit price', 'unitprice', 'price'],
} as const

function findHeader(headers: string[], aliases: readonly string[]): string | undefined {
  return headers.find((h) => aliases.some((a) => {
    const n = norm(h)
    return n === a || n.includes(a)
  }))
}

/** Parse the first sheet of an uploaded workbook into quote line items. */
export function parseQuoteWorkbook(buffer: ArrayBuffer): QuoteWorkbookParseResult {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) return { items: [], errors: ['The Excel file has no sheets.'] }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: '' })
  if (rows.length === 0) return { items: [], errors: ['No data rows found in the first sheet.'] }

  const headers = Object.keys(rows[0])
  const descHeader = findHeader(headers, HEADER_ALIASES.description)
  const qtyHeader = findHeader(headers, HEADER_ALIASES.quantity)
  // "unit" must match the Unit column exactly — otherwise the includes
  // logic would also match "Unit Price" when no Unit column exists.
  const unitHeader = headers.find((h) => norm(h) === 'unit')
  const priceHeader = findHeader(headers, HEADER_ALIASES.unitPrice)

  const missing: string[] = []
  if (!descHeader) missing.push('Designation/Description')
  if (!qtyHeader) missing.push('Qty/Quantity')
  if (!priceHeader) missing.push('Unit Price')
  if (missing.length > 0) {
    return { items: [], errors: [`Missing required column(s): ${missing.join(', ')}. Expected: Designation, Qty, Unit, Unit Price.`] }
  }

  const items: QuoteLineImportItem[] = []
  const errors: string[] = []

  rows.forEach((r, i) => {
    const description = str(r[descHeader!])
    const qtyRaw = str(r[qtyHeader!])
    const unit = unitHeader ? str(r[unitHeader]) : ''
    const priceRaw = str(r[priceHeader!])

    // Skip fully blank rows (e.g. trailing template formatting).
    if (!description && !qtyRaw && !unit && !priceRaw) return

    if (!description) {
      errors.push(`Row ${i + 2}: missing Designation, skipped`)
      return
    }
    const quantity = Number(qtyRaw)
    if (qtyRaw === '' || !Number.isFinite(quantity)) {
      errors.push(`Row ${i + 2}: invalid Qty "${qtyRaw}", skipped`)
      return
    }
    const unitPrice = Number(priceRaw)
    if (priceRaw === '' || !Number.isFinite(unitPrice)) {
      errors.push(`Row ${i + 2}: invalid Unit Price "${priceRaw}", skipped`)
      return
    }

    items.push({ description, quantity, unit, unitPrice, total: quantity * unitPrice })
  })

  return { items, errors }
}
