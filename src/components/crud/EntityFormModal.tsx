import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'tags'

export interface FieldConfig {
  key: string
  label: string
  type: FieldType
  options?: string[]
  required?: boolean
  placeholder?: string
}

interface Props {
  open: boolean
  onClose: () => void
  title: string
  fields: FieldConfig[]
  initial?: Record<string, any>
  onSubmit: (values: Record<string, any>) => Promise<void>
}

// One generic, config-driven form used to create/edit records for every
// module — keeps every entity's Create/Edit UX consistent and avoids
// bespoke forms per module while still covering its real fields.
export function EntityFormModal({ open, onClose, title, fields, initial, onSubmit }: Props) {
  const [values, setValues] = useState<Record<string, any>>(() => buildInitial(fields, initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed values whenever the modal opens for a (different) record. Only
  // reseed on open transitions — never on close — so reopening the same
  // record right after a save picks up the fresh `initial` from the parent.
  const key = open ? (initial?.id ?? 'new') : 'closed'
  const [lastKey, setLastKey] = useState(key)
  if (open && key !== lastKey) {
    setLastKey(key)
    setValues(buildInitial(fields, initial))
  }

  if (!open) return null

  const set = (k: string, v: any) => setValues((prev) => ({ ...prev, [k]: v }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validate required fields BEFORE touching the DB.
    const missing = fields.filter(
      (f) => f.required && (values[f.key] === '' || values[f.key] === undefined || values[f.key] === null)
    )
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map((f) => f.label).join(', ')}`)
      return
    }

    setSaving(true)
    try {
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
            if (!Number.isFinite(n)) {
              setError(`"${f.label}" must be a valid number`)
              return
            }
            payload[f.key] = n
          }
        } else if (f.type === 'date' && typeof payload[f.key] === 'string') {
          // <input type="date"> only accepts YYYY-MM-DD; normalize ISO
          // timestamps coming back from timestamptz columns.
          payload[f.key] = (payload[f.key] as string).slice(0, 10)
        }
      }
      await onSubmit(payload)
      onClose()
    } catch (err: any) {
      setError(err.message ?? String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          {error ? <p className="text-xs text-red-500 flex-1">{error}</p> : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="entity-form" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      }
    >
      <form id="entity-form" onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              {f.type === 'select' ? (
                <Select label={f.label} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                  <option value="">Select…</option>
                  {f.options?.map((o) => (
                    <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
                  ))}
                </Select>
              ) : f.type === 'textarea' ? (
                <Textarea label={f.label} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
              ) : f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 mt-6 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
                  {f.label}
                </label>
              ) : f.type === 'tags' ? (
                <Input label={`${f.label} (comma separated)`} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
              ) : (
                <Input
                  label={f.label}
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={values[f.key] ?? ''}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  required={f.required}
                />
              )}
            </div>
          ))}
        </div>
      </form>
    </Modal>
  )
}

function buildInitial(fields: FieldConfig[], initial?: Record<string, any>) {
  const out: Record<string, any> = {}
  for (const f of fields) {
    const v = initial?.[f.key]
    if (f.type === 'tags') out[f.key] = Array.isArray(v) ? v.join(', ') : (v ?? '')
    else if (f.type === 'date' && typeof v === 'string') out[f.key] = v.slice(0, 10)
    else out[f.key] = v ?? (f.type === 'checkbox' ? false : '')
  }
  return out
}
