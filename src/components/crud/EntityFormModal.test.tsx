// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntityFormModal, type FieldConfig } from './EntityFormModal'

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
