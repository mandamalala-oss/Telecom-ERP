import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
import { X, Plus, Library, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { makeApi } from '@/lib/api/crud'
import { buildPayload } from '@/lib/formPayload'
import { parseQuoteWorkbook } from '@/lib/quoteImport'
import { PERMISSION_MODULES } from '@/types'
import { ItemPickerModal } from './ItemPickerModal'
import type { BOQItem, NetworkType } from '@/types/v2'

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'tags' | 'multiSelect' | 'sitePicker' | 'permissions' | 'lineItems' | 'catalogItems'

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
  /** Client-side predicate applied to the fetched rows — e.g. show only
   * `team_leader` employees in the "Team Leader" dropdown. */
  filter?: (row: any, values?: Record<string, any>) => boolean
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
  /** Render a static-option select as click-to-choose chips instead of a
   * native dropdown (short fixed option lists — avoids the native
   * press-and-hold behavior of <select>). */
  chips?: boolean
  /** Only render this field while the predicate holds (conditional sections,
   * e.g. Scope of Work sub-fields gated on the two selectors above them).
   * When it turns false the field's value is dropped from the payload, so
   * stale sub-selections are never saved. */
  showWhen?: (values: Record<string, any>) => boolean
  /** Optional heading rendered above the first field of a form section. */
  section?: string
  /** Custom columns for a `lineItems` editor (default: the finance columns). */
  lineColumns?: LineColumn[]
  /** For a finance `lineItems` field: shows an Excel import button beside
   * "+ Add line". The workbook must use the Quote line-items template
   * (Designation | Qty | Unit | Unit Price). */
  importExcel?: boolean
  /** `catalogItems`: form field holding the network type ('RAN' | 'MW') that
   * gates the picker — the button stays disabled until it has a value. */
  networkField?: string
  /** Compute derived values (e.g. totals) after any value change — merged
   * into the form values, so derived fields are never stale. */
  derive?: (values: Record<string, any>) => Record<string, any>
  /** Cross-field check run on submit (visible fields only). Returning a
   * non-empty string blocks the save and surfaces the message — e.g. a task
   * whose start date is after its due date. */
  validate?: (values: Record<string, any>) => string | null
}

/** One column of a configurable `lineItems` editor row. */
export interface LineColumn {
  key: string
  label: string
  span?: number
  type?: 'text' | 'number' | 'select'
  options?: string[]
  /** Input placeholder; defaults to the header label. */
  placeholder?: string
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
  /** Optional form-level validation supplied by a module. */
  validate?: (values: Record<string, any>) => string | null
}

// Default line-item columns (finance quote/invoice/PO shape).
const LINE_DEFAULT_COLUMNS: LineColumn[] = [
  { key: 'description', label: 'Designation', span: 4 },
  { key: 'quantity', label: 'Qty', span: 2, type: 'number' },
  { key: 'unit', label: 'Unit', span: 2 },
  { key: 'unitPrice', label: 'Unit Price', span: 2, type: 'number', placeholder: 'Price' },
]

// Tailwind only emits literal classes, so map spans through this static
// lookup instead of building `col-span-${n}` at runtime (those would be
// purged and every column would collapse to 1/12 width).
const COL_SPANS: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4',
}
const spanCls = (n?: number) => COL_SPANS[n ?? 2] ?? 'col-span-2'

// Drop the values of conditional fields whose `showWhen` no longer applies,
// so switching a selector (e.g. Build Type / Technology) clears the now-
// irrelevant sub-fields instead of hiding them with stale data underneath.
// Pure + exported for unit tests.
export function pruneConditional(fields: FieldConfig[], values: Record<string, any>): Record<string, any> {
  let out: Record<string, any> | null = null
  for (const f of fields) {
    if (f.showWhen && !f.showWhen(values)) {
      out = out ?? { ...values }
      delete out[f.key]
    }
  }
  return out ?? values
}

// Merge the outputs of every field's `derive` (e.g. BOQ totals) into the
// form values. Pure + exported for unit tests.
export function applyDerived(fields: FieldConfig[], values: Record<string, any>): Record<string, any> {
  let out: Record<string, any> | null = null
  for (const f of fields) {
    if (!f.derive) continue
    const d = f.derive(values)
    if (d && Object.keys(d).length > 0) {
      out = out ?? { ...values }
      for (const k of Object.keys(d)) out[k] = d[k]
    }
  }
  return out ?? values
}

// One generic, config-driven form used to create/edit records for every
// module — keeps every entity's Create/Edit UX consistent and avoids
// bespoke forms per module while still covering its real fields.
export function EntityFormModal({ open, onClose, title, fields, initial, onSubmit, extraLookup, validate }: Props) {
  const [values, setValues] = useState<Record<string, any>>(() => buildInitial(fields, initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookupOptions, setLookupOptions] = useState<Record<string, any[]>>({})
  const [pickerNetwork, setPickerNetwork] = useState<NetworkType | null>(null)
  const lineFileRef = useRef<HTMLInputElement | null>(null)

  // Re-seed values every time the modal OPENS, from the current `initial`:
  // New always starts blank and a reopened record shows the latest saved
  // values. (The previous key-comparison only reseeded when the record
  // changed, so cancel→reopen of the same create/edit kept stale input.)
  // pruneConditional also guards against rows whose stored sub-fields
  // disagree with their selectors (only writable via direct SQL).
  useEffect(() => {
    if (open) {
      const seeded = buildInitial(fields, initial)
      if (seeded.isMilestone && seeded.startDate) seeded.dueDate = seeded.startDate
      setValues(applyDerived(fields, pruneConditional(fields, seeded)))
    }
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

  const set = (k: string, v: any) =>
    setValues((prev) => {
      const next = { ...prev, [k]: v }
      // Milestones have zero duration: editing either date keeps the pair
      // synchronized, while enabling the checkbox copies an existing start.
      if (next.isMilestone && (k === 'isMilestone' || k === 'startDate' || k === 'dueDate')) {
        if (k === 'dueDate' && v) next.startDate = v
        else if (k === 'startDate' && v) next.dueDate = v
        else if (k === 'isMilestone' && v && next.startDate) next.dueDate = next.startDate
      }
      return applyDerived(fields, pruneConditional(fields, next))
    })

  // Only fields whose conditional section is active are rendered + validated;
  // switching a selector prunes the stale sub-field values (see set).
  const visibleFields = fields.filter((f) => !f.showWhen || f.showWhen(values))

  // ── Line items (Designation / Qty / Unit / Unit-price) ─────────────────────
  // Kept in values[f.key] as an array; subtotal/tax/total derive from the rows
  // so the quote/invoice/PO totals always match the lines.
  const lineId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `li-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const linePriceKey = (f: FieldConfig) => (f.lineColumns ? 'unitCost' : 'unitPrice')
  const lineTotalKey = (f: FieldConfig) => (f.lineColumns ? 'totalCost' : 'total')
  const lineTotal = (f: FieldConfig, i: any) => (Number(i.quantity) || 0) * (Number(i[linePriceKey(f)]) || 0)
  const applyLineTotals = (f: FieldConfig, items: any[], taxRate?: number) => {
    const rows = items.map((i) => ({ ...i, [lineTotalKey(f)]: lineTotal(f, i) }))
    set(f.key, rows)
    // BOQ-style editors derive their own totals (subtotal/contingency/grandTotal
    // via the field's `derive`); finance-style editors set them here.
    if (f.lineColumns) return
    const subtotal = rows.reduce((s, i) => s + (i.total ?? 0), 0)
    set('subtotal', subtotal)
    const rate = taxRate !== undefined ? taxRate : Number(values.taxRate) || 0
    // Forms WITH a rate field derive tax from it (0/blank → tax 0, so a stale
    // tax can't survive a cleared rate); forms without one (POs) keep the
    // manual tax amount.
    const hasRateField = fields.some((x) => x.key === 'taxRate')
    const tax = rate > 0
      ? Math.round((subtotal * rate) / 100)
      : (hasRateField ? 0 : Number(values.tax) || 0)
    set('tax', tax)
    set('total', subtotal + tax)
  }
  const updateLine = (f: FieldConfig, idx: number, patch: Record<string, any>) => {
    const items = [...(values[f.key] ?? [])]
    items[idx] = { ...items[idx], ...patch }
    applyLineTotals(f, items)
  }
  const addLine = (f: FieldConfig) => {
    const base: Record<string, any> = { id: lineId(), description: '', quantity: '', unit: '' }
    for (const c of f.lineColumns ?? []) base[c.key] = ''
    base[linePriceKey(f)] = ''
    base[lineTotalKey(f)] = 0
    return applyLineTotals(f, [...(values[f.key] ?? []), base])
  }
  const removeLine = (f: FieldConfig, idx: number) =>
    applyLineTotals(f, (values[f.key] ?? []).filter((_: any, i: number) => i !== idx))

  // ── Catalog item picker (catalogItems field type) ─────────────────────────
  // Items are added exclusively through ItemPickerModal — the unit price comes
  // from the catalog and is NOT user-editable. Rows already in the list stay
  // manually editable/deletable. The picker is gated on the network field
  // (RAN | MW) so the catalog subset is always known before it can open.
  const catalogNetwork = (f: FieldConfig) =>
    values[f.networkField ?? 'networkType'] as NetworkType | undefined
  const canOpenCatalog = (f: FieldConfig) =>
    catalogNetwork(f) === 'RAN' || catalogNetwork(f) === 'MW'

  const openCatalogPicker = (f: FieldConfig) => {
    const network = catalogNetwork(f)
    if (network !== 'RAN' && network !== 'MW') return
    setPickerNetwork(network)
  }

  const handleCatalogAdd = (f: FieldConfig, picked: BOQItem[]) => {
    const items = [...(values[f.key] ?? [])]
    for (const p of picked) {
      const existingIdx = items.findIndex((i: any) => i.itemCode === p.itemCode)
      if (existingIdx < 0) {
        items.push({ ...p, id: lineId() })
        continue
      }
      // Same catalog item picked twice: ask. OK (default) = add as a second
      // line; Cancel = sum the quantities into the existing line.
      const asSecondLine = window.confirm(
        `"${p.itemCode}" is already in the list.\n\nOK = add as a second line (default)\nCancel = merge quantities into the existing line`
      )
      if (asSecondLine) {
        items.push({ ...p, id: lineId() })
      } else {
        const existing = items[existingIdx]
        const quantity = (Number(existing.quantity) || 0) + p.quantity
        items[existingIdx] = { ...existing, quantity }
        // totalCost is recomputed below by applyLineTotals.
      }
    }
    applyLineTotals(f, items)
  }

  // Excel import for finance line items (Quotes). Reads the first sheet of
  // the uploaded workbook, appends valid rows to the line list, and lets
  // applyLineTotals recompute subtotal/tax/total so the imported totals are
  // never stale.
  const handleLineImport = async (f: FieldConfig, file: File) => {
    setError(null)
    try {
      const parsed = parseQuoteWorkbook(await file.arrayBuffer())
      if (parsed.errors.length > 0) {
        setError(parsed.errors.join(' · '))
        return
      }
      const imported = parsed.items.map((item) => ({ ...item, id: lineId() }))
      applyLineTotals(f, [...(values[f.key] ?? []), ...imported])
    } catch (err: any) {
      setError(`Couldn't read the Excel file: ${err?.message ?? err}`)
    } finally {
      if (lineFileRef.current) lineFileRef.current.value = ''
    }
  }

  const itemsField = fields.find((x) => x.type === 'lineItems')
  const catalogField = fields.find((x) => x.type === 'catalogItems')

  // Module-supplied rows (projects, sites, project_sites…) take precedence
  // over the auto-fetched lookup options.
  const allOptions: Record<string, any[]> = { ...lookupOptions, ...(extraLookup ?? {}) }

  // Lookup rows for a field, with its optional client-side filter applied.
  const lookupRows = (f: FieldConfig) => {
    const rows = allOptions[f.lookup!.table] ?? []
    // Keep the editing record id and hidden lookup-populated FKs available to
    // dynamic filters without adding either value to the saved payload.
    const filterValues = { ...values, id: values.id ?? initial?.id, projectId: values.projectId ?? initial?.projectId }
    return f.lookup!.filter ? rows.filter((row) => f.lookup!.filter!(row, filterValues)) : rows
  }

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

    // Validate required fields BEFORE touching the DB (visible ones only).
    const missing = visibleFields.filter(
      (f) => f.required && (values[f.key] === '' || values[f.key] === undefined || values[f.key] === null)
    )
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map((f) => f.label).join(', ')}`)
      return
    }

    const formError = validate?.(values)
    if (formError) {
      setError(formError)
      return
    }

    // Cross-field validation (e.g. task start date ≤ due date).
    for (const f of visibleFields) {
      if (!f.validate) continue
      const msg = f.validate(values)
      if (msg) {
        setError(msg)
        return
      }
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
          {visibleFields.map((f, i) => {
            const prev = visibleFields[i - 1]
            const showSection = f.section && (!prev || prev.section !== f.section)
            return (
              <Fragment key={f.key}>
                {showSection && (
                  <h4 className="sm:col-span-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mt-3 first:mt-0">{f.section}</h4>
                )}
                <div className={f.type === 'textarea' || f.type === 'multiSelect' || f.type === 'permissions' ? 'sm:col-span-2' : ''}>
                  {f.type === 'select' ? (
                f.lookup ? (
                  <Select label={f.label} value={values[f.key] ?? ''} onChange={(e) => handleLookupChange(f, e.target.value)}>
                    <option value="">Select…</option>
                    {lookupRows(f).map((row) => (
                      <option key={row[f.lookup!.valueKey]} value={row[f.lookup!.valueKey]}>{lookupLabel(f, row)}</option>
                    ))}
                  </Select>
                ) : f.chips ? (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">{f.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(f.options ?? []).map((o) => {
                        const active = values[f.key] === o
                        return (
                          <button
                            type="button"
                            key={o}
                            onClick={() => set(f.key, active ? '' : o)}
                            className={`text-xs font-semibold rounded-full border px-3 py-1.5 transition-colors cursor-pointer ${
                              active
                                ? 'bg-brand-500 border-brand-500 text-white'
                                : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-brand-400'
                            }`}
                          >
                            {o.replace(/_/g, ' ')}
                          </button>
                        )
                      })}
                    </div>
                  </div>
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
              ) : f.type === 'permissions' ? (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{f.label}</p>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700 max-h-64 overflow-y-auto">
                    {PERMISSION_MODULES.map(m => {
                      const stored = (values[f.key] ?? {})[m.key]
                      // Show the EFFECTIVE level: per-user grant ?? (CEO has
                      // full access). Non-CEO members show nothing until the
                      // CEO grants view/edit — clicking always writes an
                      // explicit value ('none' is stored so it's an explicit
                      // denial; missing key = no access).
                      const level = stored ?? (initial?.role === 'CEO' ? 'edit' : null)
                      return (
                        <div key={m.key} className="flex items-center justify-between gap-2 px-3 py-1.5">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{m.label}</span>
                          <div className="flex items-center gap-3 text-xs">
                            {(['none', 'view', 'edit'] as const).map(lv => (
                              <label key={lv} className="flex items-center gap-1 cursor-pointer text-slate-500 dark:text-slate-400">
                                <input
                                  type="radio"
                                  name={`perm-${f.key}-${m.key}`}
                                  checked={level === lv}
                                  onChange={() => {
                                    const next = { ...(values[f.key] ?? {}) }
                                    next[m.key] = lv
                                    set(f.key, next)
                                  }}
                                />
                                {lv === 'none' ? 'None' : lv === 'view' ? 'View' : 'Edit'}
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
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
                    {/* Lookup-backed rows (existing) OR static options — the
                        Scope of Work checkbox groups are static options. */}
                    {(f.lookup
                      ? lookupRows(f).map((row) => ({ value: row[f.lookup!.valueKey], label: lookupLabel(f, row) }))
                      : (f.options ?? []).map((o) => ({ value: o, label: o.replace(/_/g, ' ') }))
                    ).map(({ value: v, label }) => {
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
                          {label}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ) : f.type === 'lineItems' || f.type === 'catalogItems' ? (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{f.label}</p>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
                    <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {(f.lineColumns ?? LINE_DEFAULT_COLUMNS).map(c => (
                        <span key={c.key} className={spanCls(c.span)}>{c.label}</span>
                      ))}
                      <span className="col-span-1 text-right">Total</span>
                      <span className="col-span-1" />
                    </div>
                    {(values[f.key] ?? []).map((item: any, idx: number) => (
                      <div key={item.id} className="grid grid-cols-12 gap-2 px-3 py-1.5 items-center">
                        {(f.lineColumns ?? LINE_DEFAULT_COLUMNS).map(c => (
                          c.type === 'select' ? (
                            <select key={c.key} className={`input ${spanCls(c.span)}`} value={item[c.key] ?? ''} onChange={(e) => updateLine(f, idx, { [c.key]: e.target.value })}>
                              <option value="">{c.label}…</option>
                              {(c.options ?? []).map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                            </select>
                          ) : (
                            <input key={c.key} className={`input ${spanCls(c.span)}`} type={c.type === 'number' ? 'number' : 'text'} min={0} placeholder={c.placeholder ?? c.label} value={item[c.key] ?? ''} onChange={(e) => updateLine(f, idx, { [c.key]: e.target.value })} />
                          )
                        ))}
                        <span className="col-span-1 text-right text-xs font-semibold">{lineTotal(f, item).toLocaleString()}</span>
                        <button type="button" onClick={() => removeLine(f, idx)} aria-label="Remove line" className="col-span-1 text-red-400 hover:text-red-600 text-xs">✕</button>
                      </div>
                    ))}
                    <div className="px-3 py-2">
                      {f.type === 'catalogItems' ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button type="button" variant="secondary" icon={<Library className="w-4 h-4" />} onClick={() => openCatalogPicker(f)} disabled={!canOpenCatalog(f)}>
                            Add from Catalog
                          </Button>
                          {!canOpenCatalog(f) && (
                            <span className="text-xs text-amber-600">Select Network (RAN/MW) above first.</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button type="button" variant="secondary" onClick={() => addLine(f)}>+ Add line</Button>
                          {f.importExcel && (
                            <>
                              <Button
                                type="button"
                                variant="secondary"
                                icon={<Upload className="w-4 h-4" />}
                                onClick={() => lineFileRef.current?.click()}
                              >
                                Import Excel
                              </Button>
                              <input
                                ref={lineFileRef}
                                type="file"
                                accept=".xlsx,.xls"
                                className="hidden"
                                aria-label={`Import ${f.label}`}
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) void handleLineImport(f, file)
                                }}
                              />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : f.type === 'tags' ? (
                <Input label={`${f.label} (comma separated)`} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
              ) : (
                <Input
                  label={f.label}
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  value={values[f.key] ?? ''}
                  onChange={(e) => {
                    set(f.key, e.target.value)
                    // Keep derived totals in sync when the tax rate changes
                    // and line items are present.
                    if (f.key === 'taxRate' && itemsField && (values.items ?? []).length) {
                      applyLineTotals(itemsField, values.items, Number(e.target.value) || 0)
                    }
                  }}
                  placeholder={f.placeholder}
                  required={f.required}
                />
              )}
                </div>
              </Fragment>
            )
          })}
        </div>
      </form>

      {pickerNetwork && catalogField && (
        <ItemPickerModal
          networkType={pickerNetwork}
          onAdd={(items) => handleCatalogAdd(catalogField, items)}
          onClose={() => setPickerNetwork(null)}
        />
      )}
    </Modal>
  )
}

function buildInitial(fields: FieldConfig[], initial?: Record<string, any>) {
  const out: Record<string, any> = {}
  for (const f of fields) {
    const v = initial?.[f.key]
    if (f.type === 'tags') out[f.key] = Array.isArray(v) ? v.join(', ') : (v ?? '')
    else if (f.type === 'multiSelect') out[f.key] = Array.isArray(v) ? [...v] : []
    else if (f.type === 'permissions') out[f.key] = v && typeof v === 'object' ? { ...v } : {}
    else if (f.type === 'lineItems' || f.type === 'catalogItems') out[f.key] = Array.isArray(v) ? v.map((i: any) => ({ ...i })) : []
    else if (f.type === 'date' && typeof v === 'string') out[f.key] = v.slice(0, 10)
    else out[f.key] = v ?? (f.type === 'checkbox' ? false : '')
  }
  return out
}
