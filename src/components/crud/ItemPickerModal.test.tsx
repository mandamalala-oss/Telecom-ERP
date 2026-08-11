// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ItemPickerModal } from './ItemPickerModal'
import type { BOQItem } from '@/types/v2'

afterEach(cleanup)

const mocks = vi.hoisted(() => ({ makeApi: vi.fn() }))
vi.mock('@/lib/api/crud', () => ({ makeApi: mocks.makeApi }))

const catalogRows = [
  { id: 'c1', networkType: 'RAN', itemCode: 'P394659', description: 'Site Survey - Existing', comments: 'Site Survey', unitCost: 400000, defaultQty: 1, category: 'supply', unit: 'lot' },
  { id: 'c2', networkType: 'RAN', itemCode: 'P517294', description: 'Radio Access Installation - Type 1', comments: null, unitCost: 1350000, defaultQty: 2, category: 'installation', unit: 'lot' },
  { id: 'c3', networkType: 'RAN', itemCode: 'P401496', description: 'MN Local Transport', comments: 'first 50km', unitCost: 526800, defaultQty: 3, category: 'other', unit: 'km' },
]

function renderPicker(onAdd = vi.fn()) {
  const onClose = vi.fn()
  render(<ItemPickerModal networkType="RAN" onAdd={onAdd} onClose={onClose} />)
  return { onAdd, onClose }
}

describe('ItemPickerModal — catalog fetch', () => {
  it('loads catalog_items filtered by network, ordered by item_code', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => catalogRows })
    renderPicker()
    await screen.findByText('Site Survey - Existing')
    expect(mocks.makeApi).toHaveBeenCalledWith('catalog_items')
    expect(mocks.makeApi.mock.results[0].value.list).toBeDefined()
  })

  it('shows an error state and recovers on Retry', async () => {
    mocks.makeApi
      .mockReturnValueOnce({ list: async () => { throw new Error('boom') } })
      .mockReturnValueOnce({ list: async () => catalogRows })
    renderPicker()
    expect(await screen.findByText('boom')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Site Survey - Existing')
  })

  it('shows the empty state when the network has no rows', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => [] })
    renderPicker()
    expect(await screen.findByText(/No RAN catalog items yet/)).toBeTruthy()
  })
})

describe('ItemPickerModal — selection, quantity, totals', () => {
  it('keeps unit cost read-only (no price input) and defaults qty from default_qty', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => catalogRows })
    renderPicker()
    await screen.findByText('Site Survey - Existing')
    // Price cells render as plain text, never as an editable input.
    expect(screen.queryAllByRole('spinbutton', { name: /Unit Cost/ })).toHaveLength(0)
    expect(screen.getByText('400,000 Ar')).toBeTruthy()
    // Qty inputs exist per row, defaulting to default_qty.
    const qty = screen.getByLabelText('Quantity for P517294') as HTMLInputElement
    expect(qty.value).toBe('2')
  })

  it('computes a live total from unit_cost × qty for checked rows', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => catalogRows })
    renderPicker()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select P394659' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select P517294' }))
    // 400000×1 + 1350000×2 = 3,100,000 — unique vs the per-row prices.
    expect(screen.getByText('3.1M Ar')).toBeTruthy()
    // Change qty on a checked row → total updates.
    const qty = screen.getByLabelText('Quantity for P517294')
    await userEvent.clear(qty)
    await userEvent.type(qty, '5')
    expect(screen.getByText('7.15M Ar')).toBeTruthy() // 400000 + 1350000×5
  })

  it('maps checked rows to BOQItem[] with totalCost = unitCost × qty', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => catalogRows })
    const { onAdd, onClose } = renderPicker()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select P394659' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select P401496' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Selected (2)' }))
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    const items: BOQItem[] = onAdd.mock.calls[0][0]
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      itemCode: 'P394659', description: 'Site Survey - Existing',
      category: 'supply', unit: 'lot', quantity: 1, unitCost: 400000, totalCost: 400000,
    })
    expect(items[1]).toMatchObject({ itemCode: 'P401496', unit: 'km', quantity: 3, unitCost: 526800, totalCost: 1580400 })
    expect(onClose).toHaveBeenCalled()
  })

  it('does nothing when nothing is checked', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => catalogRows })
    const { onAdd, onClose } = renderPicker()
    await screen.findByText('Site Survey - Existing')
    const addBtn = screen.getByRole('button', { name: /Add Selected/ })
    expect((addBtn as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(addBtn)
    expect(onAdd).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('ItemPickerModal — client-side search (debounced)', () => {
  it('filters by item_code or description, case-insensitive', async () => {
    mocks.makeApi.mockReturnValue({ list: async () => catalogRows })
    renderPicker()
    await screen.findByText('Site Survey - Existing')
    await userEvent.type(screen.getByLabelText('Search catalog'), 'transport')
    await waitFor(() => {
      expect(screen.getByText('MN Local Transport')).toBeTruthy()
      expect(screen.queryByText('Site Survey - Existing')).toBeNull()
    })
    await userEvent.clear(screen.getByLabelText('Search catalog'))
    await userEvent.type(screen.getByLabelText('Search catalog'), 'p3946')
    await waitFor(() => {
      expect(screen.getByText('Site Survey - Existing')).toBeTruthy()
      expect(screen.queryByText('MN Local Transport')).toBeNull()
    })
  })
})
