// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GroupedMultiSelect, type GroupedOption } from './GroupedMultiSelect'

afterEach(cleanup)

const options: GroupedOption[] = [
  { value: 's1', label: 'MDG-001 — Alpha', group: 'Nokia' },
  { value: 's2', label: 'MDG-002 — Beta', group: 'Nokia' },
  { value: 's3', label: 'MDG-003 — Gamma', group: 'Huawei' },
  { value: 's4', label: 'MDG-004 — Delta' }, // no vendor → uncategorized
]

function Harness({ initial = [] as string[], onChange }: { initial?: string[]; onChange?: (v: string[]) => void }) {
  const [value, setValue] = useState<string[]>(initial)
  return (
    <GroupedMultiSelect
      label="Sites"
      options={options}
      value={value}
      onChange={(v) => { setValue(v); onChange?.(v) }}
    />
  )
}

describe('GroupedMultiSelect', () => {
  it('groups options under vendor headings', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByLabelText('Sites'))
    expect(screen.getByRole('group', { name: 'Nokia' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Huawei' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Uncategorized' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'MDG-003 — Gamma' })).toBeTruthy()
  })

  it('filters options by typed text', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByLabelText('Sites'), 'Gamma')
    expect(screen.getByRole('option', { name: 'MDG-003 — Gamma' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'MDG-001 — Alpha' })).toBeNull()
  })

  it('adds a selection and removes it via its tag', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Sites'))
    await userEvent.click(screen.getByRole('option', { name: 'MDG-001 — Alpha' }))
    expect(onChange).toHaveBeenLastCalledWith(['s1'])
    expect(screen.getByRole('option', { name: 'MDG-001 — Alpha' }).getAttribute('aria-selected')).toBe('true')

    await userEvent.click(screen.getByRole('button', { name: 'Remove MDG-001 — Alpha' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('renders initial values as removable tags', () => {
    render(<Harness initial={['s2']} />)
    expect(screen.getByRole('button', { name: 'Remove MDG-002 — Beta' })).toBeTruthy()
  })
})
