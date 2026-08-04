import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { makeApi } from '@/lib/api/crud'
import { buildPayload } from '@/lib/formPayload'

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'tags' | 'multiSelect' | 'sitePicker'

export interface LookupConfig {
  /** Table to load options from (TABLES value, e.g. 'sites'). */
  table: string
  /** Row field whose value is stored in this form field (e.g. site code). */
  valueKey: string
  /** Row field used as the option label. */
  labelKey: string
  /** Optional '{field}' template for richer labels, e.g. '{siteId} — {name}'. */
  labelFormat?: string
  /** Order the option list by this row field (defaults to labelKey). */
  orderBy?: string
  /** formField → rowField: fields auto-filled when an option is chosen. */
  populate?: Record<string, string>
}

export interface FieldConfig {
  key: string
  label: string
  type: FieldType
  options?: string[]
  required?: boolean
  /**
   * Rendered in the form but EXCLUDED from the create/update payload
   * (useEntityCrud strips it before insert/update). Use for fields that
   * are handled as side effects — e.g. multiSelect site links that write
   * to a junction table via onCreated/onUpdated.
   */
  virtual?: boolean
  /** sitePicker: name of the field holding the chosen project name. */
  projectNameField?: string
  /** sitePicker: table (TABLES value) holding the project rows. */
  projectsTable?: string
  placeholder?: string
  /** Turns the field into a reference dropdown backed by another table. */
  lookup?: LookupConfig
}

interface Props {
  open: boolean
  onClose: () => void
  title: string
  fields: FieldConfig[]
  initial?: Record<string, any>
  onSubmit: (values: Record<string, any>) => Promise<void>
  /** Extra lookup rows supplied by the module (e.g. projects/sites/junction) — merged over auto-fetched options. */
  extraLookup?: Record<string, any[]>
}

// One generic, config-driven form used to create/edit records for every
// module — keeps every entity's Create/Edit UX consistent and avoids
// bespoke forms per module while still covering its real fields.
export function EntityFormModal({ open, onClose, title, fields, initial, onSubmit, extraLookup }: Props) {
  const [values, setValues] = useState<Record<string, any>>(() => buildInitial(fields, initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookupOptions, setLookupOptions] = useState<Record<string, any[]>>({})

  // Re-seed values every time the modal OPENS, from the current `initial`:
  // New always starts blank and a reopened record shows the latest saved
  // values. (The previous key-comparison only reseeded when the record
  // changed, so cancel→reopen of the same create/edit kept stale input.)
  useEffect(() => {
    if (open) setValues(buildInitial(fields, initial))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Load reference options for every lookup field, once per open.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const tables = [...new Set(fields.filter((f) => f.lookup).map((f) => f.lookup!.table))]
    Promise.all(
      tables.map(async (table) => {
        const lookup = fields.find((f) => f.lookup?.table === table)!.lookup!
        try {
          const rows = await makeApi<any>(table).list({ orderBy: lookup.orderBy ?? lookup.labelKey, ascending: true })
          if (!cancelled) setLookupOptions((prev) => ({ ...prev, [table]: rows }))
        } catch (e: any) {
          console.warn(`[lookup] failed to load options for ${table}:`, e?.message ?? e)
        }
      })
    )
    return () => { cancelled = true }
  }, [open, fields])

  if (!open) return null

  const set = (k: string, v: any) => setValues((prev) => ({ ...prev, [k]: v }))

  // Module-supplied rows (projects, sites, project_sites…) take precedence
  // over the auto-fetched lookup options.
  const allOptions: Record<string, any[]> = { ...lookupOptions, ...(extraLookup ?? {}) }

  const handleLookupChange = (f: FieldConfig, value: string) => {
    set(f.key, value)
    const lookup = f.lookup
    if (!lookup?.populate) return
    const row = (allOptions[lookup.table] ?? []).find((r) => r[lookup.valueKey] === value)
    if (!row) return
    for (const [formField, rowField] of Object.entries(lookup.populate)) {
      set(formField, row[rowField] ?? '')
    }
  }

  // sitePicker: choose a project NAME (deduped — one STARLINK), then a site
  // linked to one of that project's rows; selecting the site pulls the whole
  // project's data into the form (projectId/name/customer + PO/BAC/AC).
  const sitePickerOptions = (f: FieldConfig) => {
    const projects = allOptions[f.projectsTable ?? 'projects'] ?? []
    const junction = allOptions['project_sites'] ?? []
    const projectName = values[f.projectNameField ?? 'projectName'] ?? ''
    const projectIds = new Set(projects.filter(p => (p.name ?? '') === projectName).map(p => p.id))
    const siteIds = new Set(junction.filter(ps => projectIds.has(ps.projectId)).map(ps => ps.siteId))
    const sites = (allOptions[f.lookup!.table] ?? []).filter(s => siteIds.has(s.id))
    sites.sort((a, b) => String(a[f.lookup!.labelKey] ?? '').localeCompare(String(b[f.lookup!.labelKey] ?? '')))
    return { projects, sites }
  }

  const handleSitePickerProject = (f: FieldConfig, projectName: string) => {
    set(f.projectNameField ?? 'projectName', projectName)
    // Clear the site + everything the site pull would overwrite, so a changed
    // project can't leave stale values behind.
    set(f.key, '')
    set('projectId', '')
    for (const k of ['customerName', 'po', 'bac', 'ac']) set(k, '')
  }

  const handleSitePickerSite = (f: FieldConfig, siteId: string) => {
    set(f.key, siteId)
    const { projects } = sitePickerOptions(f)
    const junction = allOptions['project_sites'] ?? []
    const name = values[f.projectNameField ?? 'projectName'] ?? ''
    // The site's project = the row with this name whose junction links the site.
    const row = projects.find(p =>
      (p.name ?? '') === name && junction.some(ps => ps.projectId === p.id && ps.siteId === siteId)
    )
    if (!row) return
    set('projectId', row.id ?? '')
    set('customerName', row.customerName ?? '')
    set('po', row.revenue ?? '')
    set('bac', row.budget ?? '')
    set('ac', row.spent ?? '')
  }

  const lookupLabel = (f: FieldConfig, row: Record<string, any>) => {
    const lookup = f.lookup!
    if (lookup.labelFormat) {
      return lookup.labelFormat.replace(/\{(\w+)\}/g, (_, k: string) => row[k] ?? '')
    }
    return row[lookup.labelKey] ?? ''
  }

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
      // Tags → arrays, numbers → numbers (blank dropped, never 0),
      // dates → YYYY-MM-DD. Pure logic, unit-tested in formPayload.test.ts.
      const { payload, error: payloadError } = buildPayload(fields, values)
      if (payloadError) {
        setError(payloadError)
        return
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
            <div key={f.key} className={f.type === 'textarea' || f.type === 'multiSelect' ? 'sm:col-span-2' : ''}>
              {f.type === 'select' ? (
                f.lookup ? (
                  <Select label={f.label} value={values[f.key] ?? ''} onChange={(e) => handleLookupChange(f, e.target.value)}>
                    <option value="">Select…</option>
                    {(allOptions[f.lookup.table] ?? []).map((row) => (
                      <option key={row[f.lookup!.valueKey]} value={row[f.lookup!.valueKey]}>{lookupLabel(f, row)}</option>
                    ))}
                  </Select>
                ) : (
                  <Select label={f.label} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="">Select…</option>
                    {f.options?.map((o) => (
                      <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
                    ))}
                  </Select>
                )
              ) : f.type === 'textarea' ? (
                <Textarea label={f.label} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
              ) : f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 mt-6 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
                  {f.label}
                </label>
              ) : f.type === 'sitePicker' ? (
                <div className="space-y-2">
                  <Select label="Project" value={values[f.projectNameField ?? 'projectName'] ?? ''} onChange={(e) => handleSitePickerProject(f, e.target.value)}>
                    <option value="">Select project…</option>
                    {[...new Set((sitePickerOptions(f).projects).map((p: any) => p.name ?? '').filter(Boolean))]
                      .sort((a, b) => a.localeCompare(b))
                      .map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                  </Select>
                  <Select label="Site" value={values[f.key] ?? ''} onChange={(e) => handleSitePickerSite(f, e.target.value)}>
                    <option value="">Select site…</option>
                    {sitePickerOptions(f).sites.map((row: any) => (
                      <option key={row[f.lookup!.valueKey]} value={row[f.lookup!.valueKey]}>{lookupLabel(f, row)}</option>
                    ))}
                  </Select>
                </div>
              ) : f.type === 'multiSelect' ? (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{f.label}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                    {(allOptions[f.lookup!.table] ?? []).map((row) => {
                      const v = row[f.lookup!.valueKey]
                      const checked = (values[f.key] ?? []).includes(v)
                      return (
                        <label key={v} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer rounded px-1.5 py-1 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => set(f.key, checked
                              ? (values[f.key] ?? []).filter((x: string) => x !== v)
                              : [...(values[f.key] ?? []), v])}
                          />
                          {lookupLabel(f, row)}
                        </label>
                      )
                    })}
                  </div>
                </div>
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
    else if (f.type === 'multiSelect') out[f.key] = Array.isArray(v) ? [...v] : []
    else if (f.type === 'date' && typeof v === 'string') out[f.key] = v.slice(0, 10)
    else out[f.key] = v ?? (f.type === 'checkbox' ? false : '')
  }
  return out
}
