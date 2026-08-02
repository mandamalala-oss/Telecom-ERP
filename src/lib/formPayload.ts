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
