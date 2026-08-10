import type { FieldConfig } from '@/components/crud/EntityFormModal'

export interface BuildPayloadResult {
  payload: Record<string, any>
  error: string | null
}

/**
 * Convert raw form values into a save payload:
 * - `tags` → comma-split trimmed string arrays
 * - `number` → Number(), with blank dropped entirely (never 0) and
 *   non-numeric values rejected with a per-field error
 * - `date` → normalized to YYYY-MM-DD (timestamptz strings from the DB)
 * Extracted from EntityFormModal.handleSubmit so the validation rules are
 * unit-testable without a DOM (jsdom sanitizes number inputs, making the
 * NaN branch unreachable via rendered inputs).
 */
export function buildPayload(
  fields: FieldConfig[],
  values: Record<string, any>
): BuildPayloadResult {
  const payload: Record<string, any> = { ...values }
  for (const f of fields) {
    if (f.type === 'tags') {
      payload[f.key] = String(values[f.key] ?? '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
    } else if (f.type === 'multiSelect') {
      // Kept as an array of selected keys. Virtual multiSelects are stripped
      // before the table insert/update (see stripVirtualFields below) and
      // handled as side effects (e.g. junction rows) by the module's hooks.
      payload[f.key] = Array.isArray(values[f.key]) ? [...values[f.key]] : []
    } else if (f.type === 'permissions') {
      // JSONB permission map — keep as a plain object (never a string).
      payload[f.key] = values[f.key] && typeof values[f.key] === 'object' ? values[f.key] : {}
    } else if (f.type === 'lineItems') {
      // JSONB line items — normalize numbers, drop fully-empty rows.
      // Supports both shapes: finance (unitPrice/total) and BOQ (unitCost/totalCost).
      const toNum = (v: any) => {
        if (v === '' || v === undefined || v === null) return null
        const n = Number(v)
        return Number.isFinite(n) ? n : null
      }
      payload[f.key] = (Array.isArray(values[f.key]) ? values[f.key] : [])
        .map((i: any) => {
          // Normalize both shapes, then strip the BOQ keys from finance rows
          // so quotes/invoices keep their exact payload shape.
          const row: any = {
            ...i,
            quantity: toNum(i.quantity),
            unitPrice: toNum(i.unitPrice),
            unitCost: toNum(i.unitCost),
            total: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
            totalCost: (Number(i.quantity) || 0) * (Number(i.unitCost) || 0),
          }
          const hasCost = i.unitCost !== undefined && i.unitCost !== null && i.unitCost !== ''
          if (!hasCost) {
            delete row.unitCost
            delete row.totalCost
          }
          return row
        })
        .filter((i: any) =>
          String(i.description ?? '').trim() !== '' ||
          i.quantity != null ||
          String(i.unit ?? '').trim() !== '' ||
          i.unitPrice != null ||
          i.unitCost != null
        )
    } else if (f.type === 'number') {
      const v = values[f.key]
      if (v === '' || v === undefined || v === null) {
        // Never write 0 for a blank field: drop it so the DB default
        // applies (or the stored value is kept on edit).
        delete payload[f.key]
      } else {
        const n = Number(v)
        if (!Number.isFinite(n)) return { payload, error: `"${f.label}" must be a valid number` }
        payload[f.key] = n
      }
    } else if (f.type === 'date' && typeof payload[f.key] === 'string') {
      // <input type="date"> only accepts YYYY-MM-DD; normalize ISO
      // timestamps coming back from timestamptz columns.
      payload[f.key] = (payload[f.key] as string).slice(0, 10)
    }
  }
  return { payload, error: null }
}

/**
 * Remove `virtual` fields from a save payload. Virtual fields are rendered in
 * the form but don't map to table columns — the module handles them as side
 * effects (e.g. a multiSelect of site links that writes junction rows via
 * onCreated/onUpdated). Pure + unit-tested; used by useEntityCrud.
 */
export function stripVirtualFields(
  payload: Record<string, any>,
  fields: FieldConfig[]
): Record<string, any> {
  const virtual = new Set(fields.filter((f) => f.virtual).map((f) => f.key))
  if (virtual.size === 0) return payload
  const out: Record<string, any> = { ...payload }
  for (const k of virtual) delete out[k]
  return out
}
