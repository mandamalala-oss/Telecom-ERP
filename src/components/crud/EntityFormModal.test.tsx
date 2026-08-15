// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntityFormModal, pruneConditional, applyDerived, type FieldConfig, type LineColumn } from './EntityFormModal'

// vitest runs with globals:false, so RTL's auto-cleanup never registers —
// unmount after every test or renders accumulate and queries go ambiguous.
afterEach(cleanup)

// Lookup dropdowns load options through makeApi — stub it so no Supabase
// client (or env vars) is needed.
const mocks = vi.hoisted(() => ({ makeApi: vi.fn() }))
vi.mock('@/lib/api/crud', () => ({ makeApi: mocks.makeApi }))

const siteRows = [
  { id: 's1', siteId: 'MDG-001', name: 'Site Alpha', latitude: -18.9, longitude: 47.5 },
  { id: 's2', siteId: 'MDG-002', name: 'Site Beta', latitude: -19.0, longitude: 47.6 },
  { id: 's3', siteId: 'MDG-003', name: 'Site Gamma', latitude: -19.5, longitude: 47.8 },
]

function renderForm(fields: FieldConfig[], initial?: Record<string, any>) {
  const onSubmit = vi.fn(async (_values: Record<string, any>) => {})
  render(<EntityFormModal open onClose={() => {}} title="Test" fields={fields} initial={initial} onSubmit={onSubmit} />)
  return onSubmit
}

describe('EntityFormModal — required validation', () => {
  it('blocks submit and names the missing required fields', async () => {
    const onSubmit = renderForm([{ key: 'name', label: 'Name', type: 'text', required: true }])
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Please fill in: Name')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('EntityFormModal — number handling', () => {
  it('drops a blank number field instead of coercing it to 0', async () => {
    const onSubmit = renderForm([
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'name', label: 'Name', type: 'text' },
    ])
    await userEvent.type(screen.getByLabelText('Name'), 'Invoice')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.amount).toBeUndefined()
    expect(payload.name).toBe('Invoice')
  })

  it('parses valid numbers as numbers', async () => {
    const onSubmit = renderForm([{ key: 'amount', label: 'Amount', type: 'number' }])
    await userEvent.type(screen.getByLabelText('Amount'), '12.5')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual({ amount: 12.5 })
  })

  // Note: the Number.isFinite rejection path can't be exercised through a
  // rendered <input type="number"> — jsdom sanitizes every non-numeric value
  // to '' — so it's covered at the unit level in formPayload.test.ts.
})

describe('EntityFormModal — date normalization', () => {
  it('normalizes timestamptz strings to YYYY-MM-DD before submit', async () => {
    const onSubmit = renderForm([{ key: 'dueDate', label: 'Due Date', type: 'date' }], {
      dueDate: '2026-01-05T12:00:00.000Z',
    })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual({ dueDate: '2026-01-05' })
  })
})

describe('EntityFormModal — tags & checkboxes', () => {
  it('parses comma-separated tags, trimming empties', async () => {
    const onSubmit = renderForm([{ key: 'tags', label: 'Tags', type: 'tags' }])
    await userEvent.type(screen.getByLabelText('Tags (comma separated)'), ' 4G , 5G ,, MW ')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual({ tags: ['4G', '5G', 'MW'] })
  })

  it('defaults untouched checkboxes to false (not undefined)', async () => {
    const onSubmit = renderForm([{ key: 'isPrimary', label: 'Primary Contact', type: 'checkbox' }])
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual({ isPrimary: false })
  })
})

describe('EntityFormModal — fresh form on every open', () => {
  it('resets to blank after cancel/reopen (no stale input)', async () => {
    const fields: FieldConfig[] = [{ key: 'name', label: 'Name', type: 'text' }]
    const onSubmit = vi.fn(async (_v: Record<string, any>) => {})
    const { rerender } = render(
      <EntityFormModal open onClose={() => {}} title="Test" fields={fields} onSubmit={onSubmit} />
    )
    await userEvent.type(screen.getByLabelText('Name'), 'Invoice X')
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Invoice X')

    // Close (cancel) then reopen as a fresh create — must be blank again.
    rerender(<EntityFormModal open={false} onClose={() => {}} title="Test" fields={fields} onSubmit={onSubmit} />)
    rerender(<EntityFormModal open onClose={() => {}} title="Test" fields={fields} onSubmit={onSubmit} />)
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('')
  })

  it('re-seeds from the latest initial when reopening the same record', async () => {
    const fields: FieldConfig[] = [{ key: 'name', label: 'Name', type: 'text' }]
    const onSubmit = vi.fn(async (_v: Record<string, any>) => {})
    const { rerender } = render(
      <EntityFormModal open onClose={() => {}} title="Test" fields={fields} initial={{ id: 'a', name: 'Old' }} onSubmit={onSubmit} />
    )
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Old')

    // Saved record comes back with fresh data → reopen shows the new value.
    rerender(<EntityFormModal open={false} onClose={() => {}} title="Test" fields={fields} initial={{ id: 'a', name: 'Old' }} onSubmit={onSubmit} />)
    rerender(<EntityFormModal open onClose={() => {}} title="Test" fields={fields} initial={{ id: 'a', name: 'New' }} onSubmit={onSubmit} />)
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('New')
  })
})

describe('EntityFormModal — lookup auto-population', () => {
  const lookupFields: FieldConfig[] = [
    {
      key: 'siteCode',
      label: 'Site Code',
      type: 'select',
      required: true,
      lookup: {
        table: 'sites',
        valueKey: 'siteId',
        labelKey: 'name',
        labelFormat: '{siteId} — {name}',
        populate: { siteName: 'name', latitude: 'latitude' },
      },
    },
    { key: 'siteName', label: 'Site Name', type: 'text' },
    { key: 'latitude', label: 'Latitude', type: 'number' },
  ]

  it('renders formatted options from the lookup table', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => siteRows })
    renderForm(lookupFields)
    expect(await screen.findByRole('option', { name: 'MDG-001 — Site Alpha' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'MDG-002 — Site Beta' })).toBeTruthy()
  })

  it('auto-fills populate fields when an option is chosen', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => siteRows })
    const onSubmit = renderForm(lookupFields)
    await userEvent.selectOptions(await screen.findByLabelText('Site Code'), 'MDG-001')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ siteCode: 'MDG-001', siteName: 'Site Alpha', latitude: -18.9 })
  })
})

describe('EntityFormModal — multiSelect', () => {
  const multiFields: FieldConfig[] = [
    {
      key: 'siteIds',
      label: 'Sites',
      type: 'multiSelect',
      virtual: true,
      lookup: { table: 'sites', valueKey: 'id', labelKey: 'name', labelFormat: '{siteId} — {name}', orderBy: 'siteId' },
    },
    { key: 'name', label: 'Name', type: 'text' },
  ]

  it('renders one checkbox per lookup row with the formatted label', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => siteRows })
    renderForm(multiFields)
    expect(await screen.findByRole('checkbox', { name: 'MDG-001 — Site Alpha' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'MDG-002 — Site Beta' })).toBeTruthy()
  })

  it('collects toggled selections into a string[] in the payload', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => siteRows })
    const onSubmit = renderForm(multiFields)
    await userEvent.type(screen.getByLabelText('Name'), 'STARLINK')
    await userEvent.click(await screen.findByRole('checkbox', { name: 'MDG-001 — Site Alpha' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'MDG-002 — Site Beta' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'STARLINK', siteIds: ['s1', 's2'] })
  })

  it('pre-checks boxes from the initial value (edit flow)', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => siteRows })
    renderForm(multiFields, { siteIds: ['s2'] })
    const alpha = await screen.findByRole('checkbox', { name: 'MDG-001 — Site Alpha' })
    const beta = screen.getByRole('checkbox', { name: 'MDG-002 — Site Beta' })
    expect((alpha as HTMLInputElement).checked).toBe(false)
    expect((beta as HTMLInputElement).checked).toBe(true)
  })

  it('unchecks a selected box on second click', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => siteRows })
    const onSubmit = renderForm(multiFields, { siteIds: ['s1', 's2'] })
    const alpha = await screen.findByRole('checkbox', { name: 'MDG-001 — Site Alpha' })
    await userEvent.click(alpha)
    await userEvent.type(screen.getByLabelText('Name'), 'X')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ siteIds: ['s2'] })
  })
})

describe('EntityFormModal — sitePicker', () => {
  const projectRows = [
    { id: 'p1', name: 'STARLINK', customerName: 'Telma', budget: 1_000_000, spent: 320_000, revenue: 2_500_000 },
    { id: 'p2', name: 'STARLINK', customerName: 'Telma', budget: 2_000_000, spent: 900_000, revenue: 3_500_000 },
    { id: 'p3', name: 'ORANGE 2026', customerName: 'Orange', budget: 500_000, spent: 100_000, revenue: 800_000 },
  ]
  const junctionRows = [
    { projectId: 'p1', siteId: 's1' },
    { projectId: 'p2', siteId: 's2' },
    { projectId: 'p3', siteId: 's3' },
  ]
  const pickerField: FieldConfig = {
    key: 'siteId', label: 'Project & Site', type: 'sitePicker', required: true, virtual: true,
    projectNameField: 'projectName', projectsTable: 'projects',
    lookup: { table: 'sites', valueKey: 'id', labelKey: 'name', labelFormat: '{siteId} — {name}' },
  }
  const fields: FieldConfig[] = [
    pickerField,
    { key: 'projectName', label: 'Project Name', type: 'text' },
    { key: 'po', label: 'PO', type: 'number' },
    { key: 'bac', label: 'BAC', type: 'number' },
    { key: 'ac', label: 'AC', type: 'number' },
  ]
  const extraLookup = { projects: projectRows, project_sites: junctionRows, sites: siteRows }

  function renderSiteForm(initial?: Record<string, any>) {
    const onSubmit = vi.fn(async (_values: Record<string, any>) => {})
    render(
      <EntityFormModal open onClose={() => {}} title="Test" fields={fields} initial={initial} onSubmit={onSubmit} extraLookup={extraLookup} />
    )
    return onSubmit
  }

  it('shows each project name only once (one STARLINK)', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => siteRows })
    renderSiteForm()
    await screen.findByRole('option', { name: 'STARLINK' })
    const names = screen.getAllByRole('option').map(o => o.textContent)
    expect(names.filter(t => t === 'STARLINK')).toHaveLength(1)
    expect(names).toContain('ORANGE 2026')
  })

  it('lists only the sites of the chosen project', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => siteRows })
    renderSiteForm()
    await userEvent.selectOptions(await screen.findByLabelText('Project'), 'STARLINK')
    const siteSelect = screen.getByLabelText('Site')
    const siteNames = Array.from(siteSelect.querySelectorAll('option')).map(o => o.textContent)
    expect(siteNames).toContain('MDG-001 — Site Alpha')
    expect(siteNames).toContain('MDG-002 — Site Beta')
    expect(siteNames).not.toContain('MDG-003 — Site Gamma')
  })

  it('pulls the site’s project data (PO/BAC/AC/name/customer) into the payload', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => siteRows })
    const onSubmit = renderSiteForm()
    await userEvent.selectOptions(await screen.findByLabelText('Project'), 'STARLINK')
    await userEvent.selectOptions(screen.getByLabelText('Site'), 's1')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      siteId: 's1',
      projectName: 'STARLINK',
      projectId: 'p1',
      customerName: 'Telma',
      po: 2_500_000,
      bac: 1_000_000,
      ac: 320_000,
    })
  })

  it('blocks submit until a site is chosen (required)', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => siteRows })
    const onSubmit = renderSiteForm()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Please fill in: Project & Site')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('pre-selects the site from the edit initial', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => siteRows })
    const onSubmit = renderSiteForm({ projectName: 'STARLINK', siteId: 's2' })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ siteId: 's2', projectName: 'STARLINK' })
  })
})

describe('EntityFormModal — permissions matrix', () => {
  const permField: FieldConfig = { key: 'permissions', label: 'Module Permissions', type: 'permissions' }

  it('renders a None/View/Edit radio set per module', async () => {
    renderForm([permField])
    await screen.findByText('Projects')
    const row = screen.getByText('Projects').closest('div')!
    expect(within(row).getByRole('radio', { name: 'View' })).toBeTruthy()
    expect(within(row).getByRole('radio', { name: 'Edit' })).toBeTruthy()
    expect(within(row).getByRole('radio', { name: 'None' })).toBeTruthy()
  })

  it('saves view/edit/none explicitly (none must beat role defaults)', async () => {
    const onSubmit = renderForm([permField, { key: 'name', label: 'Name', type: 'text' }])
    await userEvent.type(screen.getByLabelText('Name'), 'Ada')
    // Set Projects → Edit, Sites → View, Finance → None
    const projectRow = screen.getByText('Projects').closest('div')!
    await userEvent.click(within(projectRow).getByRole('radio', { name: 'Edit' }))
    const sitesRow = screen.getByText('Telecom Sites').closest('div')!
    await userEvent.click(within(sitesRow).getByRole('radio', { name: 'View' }))
    const financeRow = screen.getByText('Finance').closest('div')!
    await userEvent.click(within(financeRow).getByRole('radio', { name: 'None' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].permissions).toEqual({ projects: 'edit', sites: 'view', finance: 'none' })
  })

  it('pre-fills the matrix from the edit initial', async () => {
    renderForm([permField], { permissions: { projects: 'edit', finance: 'view' } })
    const projectRow = screen.getByText('Projects').closest('div')!
    expect((within(projectRow).getByRole('radio', { name: 'Edit' }) as HTMLInputElement).checked).toBe(true)
    const financeRow = screen.getByText('Finance').closest('div')!
    expect((within(financeRow).getByRole('radio', { name: 'View' }) as HTMLInputElement).checked).toBe(true)
  })
})

describe('EntityFormModal — line items', () => {
  const itemsField: FieldConfig = { key: 'items', label: 'Line Items', type: 'lineItems' }
  const moneyFields: FieldConfig[] = [
    itemsField,
    { key: 'subtotal', label: 'Subtotal', type: 'number' },
    { key: 'taxRate', label: 'Tax Rate %', type: 'number' },
    { key: 'tax', label: 'Tax', type: 'number' },
    { key: 'total', label: 'Total', type: 'number' },
  ]

  it('enters line items and derives subtotal/tax/total', async () => {
    const onSubmit = renderForm(moneyFields)
    await userEvent.click(screen.getByRole('button', { name: '+ Add line' }))

    const rows = () => screen.getAllByPlaceholderText('Designation')
    await userEvent.type(rows()[0], 'Cable 4G')
    await userEvent.type(screen.getByPlaceholderText('Qty'), '2')
    await userEvent.type(screen.getByPlaceholderText('Unit'), 'm')
    await userEvent.type(screen.getByPlaceholderText('Price'), '500')
    // 2 × 500 = 1000 subtotal, tax rate 0 → tax 0, total 1000
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())

    const payload = onSubmit.mock.calls[0][0]
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0]).toMatchObject({ description: 'Cable 4G', quantity: 2, unit: 'm', unitPrice: 500, total: 1000 })
    expect(payload.subtotal).toBe(1000)
    expect(payload.total).toBe(1000)
  })

  it('applies the tax rate to the derived totals', async () => {
    const onSubmit = renderForm(moneyFields)
    await userEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    await userEvent.type(screen.getByPlaceholderText('Qty'), '3')
    await userEvent.type(screen.getByPlaceholderText('Price'), '1000')
    await userEvent.type(screen.getByLabelText('Tax Rate %'), '10')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())

    const payload = onSubmit.mock.calls[0][0]
    expect(payload.subtotal).toBe(3000)
    expect(payload.tax).toBe(300)
    expect(payload.total).toBe(3300)
  })

  it('zeroes the tax when the rate is cleared so no stale tax survives', async () => {
    const onSubmit = renderForm(moneyFields)
    await userEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    await userEvent.type(screen.getByPlaceholderText('Qty'), '3')
    await userEvent.type(screen.getByPlaceholderText('Price'), '1000')
    const rate = screen.getByLabelText('Tax Rate %')
    await userEvent.type(rate, '10')
    await userEvent.clear(rate) // rate back to blank → tax must drop to 0
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())

    const payload = onSubmit.mock.calls[0][0]
    expect(payload.subtotal).toBe(3000)
    expect(payload.tax).toBe(0)
    expect(payload.total).toBe(3000)
  })

  it('removes a line and pre-fills from edit initial', async () => {
    const onSubmit = renderForm(moneyFields, {
      items: [{ id: 'i1', description: 'Tower', quantity: 1, unit: 'u', unitPrice: 9000, total: 9000 }],
      subtotal: 9000,
      taxRate: 0,
      tax: 0,
      total: 9000,
    })
    expect(screen.getByDisplayValue('Tower')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Remove line' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].items).toHaveLength(0)
  })
})

describe('pruneConditional', () => {
  const fields: FieldConfig[] = [
    { key: 'build', label: 'Build', type: 'select', options: ['NSB', 'MOD'] },
    { key: 'tech', label: 'Tech', type: 'select', options: ['RAN', 'MW'] },
    { key: 'items', label: 'Items', type: 'multiSelect', options: ['A', 'B'], showWhen: (v) => v.build === 'NSB' && v.tech === 'RAN' },
    { key: 'dish', label: 'Dish', type: 'select', options: ['1m'], showWhen: (v) => v.build === 'NSB' && v.tech === 'MW' },
  ]

  it('keeps values of active conditional fields', () => {
    expect(pruneConditional(fields, { build: 'NSB', tech: 'RAN', items: ['A'] })).toEqual({ build: 'NSB', tech: 'RAN', items: ['A'] })
  })

  it('drops values of now-inactive conditional fields', () => {
    expect(pruneConditional(fields, { build: 'NSB', tech: 'MW', items: ['A'] })).toEqual({ build: 'NSB', tech: 'MW' })
    expect(pruneConditional(fields, { build: 'MOD', tech: 'RAN', items: ['A'], dish: '1m' })).toEqual({ build: 'MOD', tech: 'RAN' })
  })

  it('does not change values when inactive conditional fields are unset', () => {
    const v = { build: 'NSB', tech: 'MW', dish: '1m' }
    expect(pruneConditional(fields, v)).toEqual(v)
  })
})

describe('applyDerived', () => {
  const fields: FieldConfig[] = [
    { key: 'items', label: 'Items', type: 'lineItems', derive: (v) => ({ subtotal: (v.items ?? []).reduce((s: number, i: any) => s + (Number(i.totalCost) || 0), 0) }) },
    { key: 'subtotal', label: 'Subtotal', type: 'number' },
  ]

  it('merges derived values into the form values', () => {
    expect(applyDerived(fields, { items: [{ totalCost: 500 }, { totalCost: 300 }] })).toEqual({
      items: [{ totalCost: 500 }, { totalCost: 300 }],
      subtotal: 800,
    })
  })

  it('is a no-op when no field derives', () => {
    const v = { a: 1 }
    expect(applyDerived([], v)).toBe(v)
  })
})

describe('EntityFormModal — BOQ (line items + derived totals)', () => {
  const BOQ_COLUMNS: LineColumn[] = [
    { key: 'itemCode', label: 'Code', span: 1 },
    { key: 'description', label: 'Description', span: 3 },
    { key: 'category', label: 'Category', span: 2, type: 'select', options: ['civil', 'supply'] },
    { key: 'unit', label: 'Unit', span: 1 },
    { key: 'quantity', label: 'Qty', span: 1, type: 'number' },
    { key: 'unitCost', label: 'Unit Cost', span: 2, type: 'number' },
  ]
  const boqDerive = (v: Record<string, any>) => {
    const subtotal = (v.items ?? []).reduce((s: number, i: any) => s + (Number(i.totalCost) || 0), 0)
    const contingency = Math.round((subtotal * (Number(v.contingencyPct) || 0)) / 100)
    return { subtotal, contingency, grandTotal: subtotal + contingency }
  }
  const BOQ_FIELDS: FieldConfig[] = [
    { key: 'boqNumber', label: 'BOQ Number', type: 'text', required: true },
    { key: 'items', label: 'Line Items', type: 'lineItems', lineColumns: BOQ_COLUMNS, derive: boqDerive },
    { key: 'subtotal', label: 'Subtotal', type: 'number' },
    { key: 'contingencyPct', label: 'Contingency %', type: 'number' },
    { key: 'contingency', label: 'Contingency', type: 'number' },
    { key: 'grandTotal', label: 'Grand Total', type: 'number' },
  ]

  it('renders the BOQ columns and derives totals from items + contingency', async () => {
    const onSubmit = renderForm(BOQ_FIELDS)
    await userEvent.type(screen.getByLabelText('BOQ Number'), 'BOQ-1')
    await userEvent.click(screen.getByRole('button', { name: '+ Add line' }))
    await userEvent.type(screen.getByPlaceholderText('Code'), 'C01')
    await userEvent.type(screen.getByPlaceholderText('Description'), 'Concrete')
    await userEvent.type(screen.getByPlaceholderText('Qty'), '2')
    await userEvent.type(screen.getByPlaceholderText('Unit Cost'), '500')
    await userEvent.type(screen.getByLabelText('Contingency %'), '10')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.items[0]).toMatchObject({ itemCode: 'C01', description: 'Concrete', quantity: 2, unitCost: 500, totalCost: 1000 })
    expect(payload.subtotal).toBe(1000)
    expect(payload.contingency).toBe(100)
    expect(payload.grandTotal).toBe(1100)
  })
})

describe('EntityFormModal — Scope of Work (conditional sections)', () => {
  const SCOPE_FIELDS: FieldConfig[] = [
    { key: 'scopeBuildType', label: 'Build Type', type: 'select', options: ['NSB', 'MOD'] },
    { key: 'scopeTechnology', label: 'Technology', type: 'select', options: ['RAN', 'MW'] },
    { key: 'scopeNsbRanItems', label: 'Scope Items', type: 'multiSelect', options: ['ANTENNA', 'RRU', 'FO', 'RACK', 'BASEBAND'], showWhen: (v) => v.scopeBuildType === 'NSB' && v.scopeTechnology === 'RAN' },
    { key: 'scopeNsbMwDishSize', label: 'Dish Size', type: 'select', chips: true, options: ['0.3m', '0.6m', '0.9m', '1.2m', '1.8m', '2.4m', '3m'], showWhen: (v) => v.scopeBuildType === 'NSB' && v.scopeTechnology === 'MW' },
    { key: 'scopeModRanAddItems', label: 'ADD Items', type: 'multiSelect', options: ['RRU', 'ANTENNA', 'RACK', 'BASEBAND'], showWhen: (v) => v.scopeBuildType === 'MOD' && v.scopeTechnology === 'RAN' },
    { key: 'scopeModRanSwapItems', label: 'SWAP Items', type: 'multiSelect', options: ['RRU', 'ANTENNA', 'RACK', 'BASEBAND'], showWhen: (v) => v.scopeBuildType === 'MOD' && v.scopeTechnology === 'RAN' },
    { key: 'scopeModMwSwapDishSize', label: 'Dish Size — SWAP', type: 'select', chips: true, options: ['0.3m', '0.6m', '0.9m', '1.2m', '1.8m', '2.4m', '3m'], showWhen: (v) => v.scopeBuildType === 'MOD' && v.scopeTechnology === 'MW' },
  ]

  const pick = async (build: string, tech: string) => {
    await userEvent.selectOptions(screen.getByLabelText('Build Type'), build)
    await userEvent.selectOptions(screen.getByLabelText('Technology'), tech)
  }

  it('acceptance #1 — NSB + RAN shows exactly the 5-item checkbox group', async () => {
    renderForm(SCOPE_FIELDS)
    expect(screen.queryByRole('checkbox')).toBeNull() // nothing until both selectors
    await pick('NSB', 'RAN')
    const boxes = screen.getAllByRole('checkbox').map((b) => b.getAttribute('aria-label') ?? '')
    // checkbox labels come from the <label> text; assert the full set
    for (const o of ['ANTENNA', 'RRU', 'FO', 'RACK', 'BASEBAND']) {
      expect(screen.getByRole('checkbox', { name: o })).toBeTruthy()
    }
    expect(boxes).toHaveLength(5)
    expect(screen.queryByLabelText('Dish Size')).toBeNull()
  })

  it('acceptance #2 — NSB + MW shows exactly the dish-size chips (click to choose)', async () => {
    const onSubmit = renderForm(SCOPE_FIELDS)
    await pick('NSB', 'MW')
    expect(screen.getByText('Dish Size')).toBeTruthy()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByText('ADD Items')).toBeNull()
    // Chips: single click selects (no native dropdown / hold-to-select).
    await userEvent.click(screen.getByRole('button', { name: '0.6m' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ scopeBuildType: 'NSB', scopeTechnology: 'MW', scopeNsbMwDishSize: '0.6m' })
  })

  it('acceptance #3 — MOD + RAN shows both ADD and SWAP groups simultaneously', async () => {
    renderForm(SCOPE_FIELDS)
    await pick('MOD', 'RAN')
    expect(screen.getByText('ADD Items')).toBeTruthy()
    expect(screen.getByText('SWAP Items')).toBeTruthy()
    // Same 4 options in each group → 8 checkboxes
    expect(screen.getAllByRole('checkbox')).toHaveLength(8)
    expect(screen.queryByText('Dish Size')).toBeNull()
  })

  it('acceptance #4 — MOD + MW shows exactly the SWAP dish-size chips', async () => {
    renderForm(SCOPE_FIELDS)
    await pick('MOD', 'MW')
    expect(screen.getByText('Dish Size — SWAP')).toBeTruthy()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.queryByText('ADD Items')).toBeNull()
  })

  it('acceptance #5 — switching a selector clears the stale sub-selections', async () => {
    const onSubmit = renderForm(SCOPE_FIELDS)
    await pick('NSB', 'RAN')
    await userEvent.click(screen.getByRole('checkbox', { name: 'ANTENNA' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'RRU' }))
    // Switch Technology to MW: the NSB/RAN group hides and its values are pruned.
    await userEvent.selectOptions(screen.getByLabelText('Technology'), 'MW')
    expect(screen.queryByLabelText('Scope Items')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.scopeBuildType).toBe('NSB')
    expect(payload.scopeTechnology).toBe('MW')
    // The pruned group is saved as an empty array — i.e. cleared, not stale.
    expect(payload.scopeNsbRanItems).toEqual([])
  })

  it('acceptance #6 — persisted values reload with their conditional section', async () => {
    const onSubmit = renderForm(SCOPE_FIELDS, {
      scopeBuildType: 'NSB',
      scopeTechnology: 'RAN',
      scopeNsbRanItems: ['ANTENNA', 'RRU'],
    })
    const ant = screen.getByRole('checkbox', { name: 'ANTENNA' }) as HTMLInputElement
    const rru = screen.getByRole('checkbox', { name: 'RRU' }) as HTMLInputElement
    const fo = screen.getByRole('checkbox', { name: 'FO' }) as HTMLInputElement
    expect(ant.checked).toBe(true)
    expect(rru.checked).toBe(true)
    expect(fo.checked).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].scopeNsbRanItems).toEqual(['ANTENNA', 'RRU'])
  })
})

describe('EntityFormModal — catalogItems picker wiring', () => {
  const catalogRows = [
    { id: 'c1', networkType: 'RAN', itemCode: 'P394659', description: 'Site Survey - Existing', unitCost: 400000, defaultQty: 1, category: 'supply', unit: 'lot' },
    { id: 'c2', networkType: 'RAN', itemCode: 'P517294', description: 'Radio Access Installation - Type 1', unitCost: 1350000, defaultQty: 2, category: 'installation', unit: 'lot' },
  ]
  const CATALOG_FIELDS: FieldConfig[] = [
    { key: 'networkType', label: 'Network', type: 'select', options: ['RAN', 'MW'], chips: true, required: true },
    { key: 'boqNumber', label: 'BOQ Number', type: 'text', required: true },
    { key: 'items', label: 'Line Items', type: 'catalogItems', lineColumns: [], derive: (v) => ({ subtotal: (v.items ?? []).reduce((s: number, i: any) => s + (Number(i.totalCost) || 0), 0) }) },
  ]

  beforeEach(() => {
    mocks.makeApi.mockReturnValue({ list: async () => catalogRows })
  })

  it('saves the networkType chosen at the top of the form', async () => {
    const onSubmit = renderForm(CATALOG_FIELDS)
    await userEvent.click(screen.getByRole('button', { name: 'RAN' }))
    await userEvent.type(screen.getByLabelText('BOQ Number'), 'BOQ-2026-001')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ networkType: 'RAN' })
  })

  it('keeps "Add from Catalog" disabled until a network is selected', async () => {
    renderForm(CATALOG_FIELDS)
    const addBtn = screen.getByRole('button', { name: 'Add from Catalog' })
    expect((addBtn as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Select Network (RAN/MW) above first.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'RAN' }))
    expect((screen.getByRole('button', { name: 'Add from Catalog' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('opens the picker with the selected network and appends picked items into the form', async () => {
    const onSubmit = renderForm(CATALOG_FIELDS)
    await userEvent.click(screen.getByRole('button', { name: 'RAN' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add from Catalog' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select P394659' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select P517294' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Selected (2)' }))

    // Picker closes; the two rows are now in the form's line editor.
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Select P394659' })).toBeNull())
    await userEvent.type(screen.getByLabelText('BOQ Number'), 'BOQ-2026-001')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const items = onSubmit.mock.calls[0][0].items
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ itemCode: 'P394659', quantity: 1, unitCost: 400000, totalCost: 400000 })
    expect(items[1]).toMatchObject({ itemCode: 'P517294', quantity: 2, unitCost: 1350000, totalCost: 2700000 })
  })

  it('asks on duplicate itemCode: OK (default) adds a second line', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSubmit = renderForm(CATALOG_FIELDS, {
      items: [{ id: 'x1', itemCode: 'P394659', description: 'Site Survey - Existing', unit: 'lot', quantity: 1, unitCost: 400000, totalCost: 400000, category: 'supply' }],
    })
    await userEvent.click(screen.getByRole('button', { name: 'RAN' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add from Catalog' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select P394659' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Selected (1)' }))
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('P394659')))
    await userEvent.type(screen.getByLabelText('BOQ Number'), 'BOQ-2026-001')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0].items).toHaveLength(2)
    confirmSpy.mockRestore()
  })

  it('asks on duplicate itemCode: Cancel merges quantities into the existing line', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onSubmit = renderForm(CATALOG_FIELDS, {
      items: [{ id: 'x1', itemCode: 'P394659', description: 'Site Survey - Existing', unit: 'lot', quantity: 1, unitCost: 400000, totalCost: 400000, category: 'supply' }],
    })
    await userEvent.click(screen.getByRole('button', { name: 'RAN' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add from Catalog' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select P394659' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Selected (1)' }))
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled())
    await userEvent.type(screen.getByLabelText('BOQ Number'), 'BOQ-2026-001')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const items = onSubmit.mock.calls[0][0].items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ itemCode: 'P394659', quantity: 2, totalCost: 800000 })
    confirmSpy.mockRestore()
  })

  it('blocks submit until networkType is chosen (required)', async () => {
    const onSubmit = renderForm(CATALOG_FIELDS)
    await userEvent.type(screen.getByLabelText('BOQ Number'), 'BOQ-2026-001')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Please fill in: Network')).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('EntityFormModal — lookup filter (field-op crew)', () => {
  const empRows = [
    { id: 'e1', name: 'Alice Leader', role: 'team_leader' },
    { id: 'e2', name: 'Bob Tech', role: 'technician' },
    { id: 'e3', name: 'Carl Rigger', role: 'rigger' },
    { id: 'e4', name: 'Dana Driver', role: 'driver' },
  ]
  const fields: FieldConfig[] = [
    { key: 'teamLeaderId', label: 'Team Leader', type: 'select', lookup: { table: 'employees', valueKey: 'id', labelKey: 'name', labelFormat: '{name} ({role})', orderBy: 'name', filter: (r: any) => r.role === 'team_leader' } },
    { key: 'riggerId', label: 'Rigger', type: 'select', lookup: { table: 'employees', valueKey: 'id', labelKey: 'name', labelFormat: '{name} ({role})', orderBy: 'name', filter: (r: any) => r.role === 'rigger' } },
  ]

  it('scopes each dropdown to its role via lookup.filter', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => empRows })
    renderForm(fields)
    const leader = await screen.findByLabelText('Team Leader') as HTMLSelectElement
    const rigger = screen.getByLabelText('Rigger') as HTMLSelectElement
    const opts = (el: HTMLSelectElement) => Array.from(el.querySelectorAll('option')).map((o) => o.textContent)
    expect(opts(leader)).toEqual(['Select…', 'Alice Leader (team_leader)'])
    expect(opts(rigger)).toEqual(['Select…', 'Carl Rigger (rigger)'])
  })

  it('crew fields are optional — saves with a partial team', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => empRows })
    const onSubmit = renderForm(fields)
    await userEvent.selectOptions(await screen.findByLabelText('Team Leader'), 'e1')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ teamLeaderId: 'e1' })
    expect(onSubmit.mock.calls[0][0].riggerId).toBeUndefined()
  })
})
