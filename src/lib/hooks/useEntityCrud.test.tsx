// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, cleanup } from '@testing-library/react'
import { useEntityCrud } from './useEntityCrud'

const authMock = vi.hoisted(() => ({ canEdit: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authMock }))

const mocks = vi.hoisted(() => {
  const api = {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: 'new' })),
    update: vi.fn(async () => ({ id: '1' })),
    remove: vi.fn(async () => undefined),
  }
  const makeApi = vi.fn(() => api)
  return { makeApi, api }
})
vi.mock('@/lib/api/crud', () => ({ makeApi: mocks.makeApi }))

const row = { id: '1', name: 'Site A' }

beforeEach(() => {
  vi.clearAllMocks()
  authMock.canEdit.mockReturnValue(true)
})
afterEach(() => cleanup())

describe('useEntityCrud — module-permission gating', () => {
  it('allows create/update/remove when the user has edit on the module', async () => {
    const { result } = renderHook(() => useEntityCrud<{ id?: string; name?: string }>('sites', 'Site'))
    act(() => { result.current.openEdit(row) })
    expect(result.current.editing).toEqual(row)

    await result.current.update('1', { name: 'B' })
    await result.current.remove('1')
    await result.current.create({ name: 'C' })
    expect(mocks.api.update).toHaveBeenCalled()
    expect(mocks.api.remove).toHaveBeenCalled()
    expect(mocks.api.create).toHaveBeenCalled()
  })

  it('blocks openEdit/openCreate/update/remove when the user lacks edit', async () => {
    authMock.canEdit.mockReturnValue(false)
    const { result } = renderHook(() => useEntityCrud<{ id?: string; name?: string }>('sites', 'Site'))

    act(() => { result.current.openEdit(row) })
    expect(result.current.editing).toBeNull() // modal never opened
    act(() => { result.current.openCreate() })
    expect(result.current.editing).toBeNull()

    await result.current.update('1', { name: 'B' })
    await result.current.remove('1')
    await result.current.create({ name: 'C' })
    expect(mocks.api.update).not.toHaveBeenCalled()
    expect(mocks.api.remove).not.toHaveBeenCalled()
    expect(mocks.api.create).not.toHaveBeenCalled()
  })

  it('does not gate tables without a module mapping', async () => {
    authMock.canEdit.mockReturnValue(false)
    const { result } = renderHook(() => useEntityCrud<{ id?: string; name?: string }>('project_sites', 'Project Site'))
    act(() => { result.current.openEdit(row) })
    expect(result.current.editing).toEqual(row)
  })
})
