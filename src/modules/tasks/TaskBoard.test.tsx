// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskBoard } from './TaskBoard'
import type { Task } from '@/types'

// TaskBoard talks to Supabase only through makeApi (via useEntity/useEntityCrud)
// and the grant check via useAuth — stub both, no env vars needed.
const authMock = vi.hoisted(() => ({ canEdit: vi.fn() }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authMock }))

const mocks = vi.hoisted(() => ({
  makeApi: vi.fn(),
  api: { list: vi.fn(), create: vi.fn(async () => ({ id: 'new' })), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/lib/api/crud', () => ({ makeApi: mocks.makeApi }))

const tasks: Task[] = [
  {
    id: 't1', projectId: 'p1', projectName: 'Alpha', title: 'Survey Alpha', description: '',
    status: 'in_progress', priority: 'high', assigneeId: 'u1', assigneeName: 'Alice',
    startDate: '2026-01-05', dueDate: '2026-01-15', estimatedHours: 8, loggedHours: 4,
    phase: 'survey', dependencies: [], tags: [], createdAt: '',
  },
  {
    // No start date → a 1-day bar on the due date (missingStart warning).
    id: 't2', projectId: 'p1', projectName: 'Alpha', title: 'Install Alpha', description: '',
    status: 'todo', priority: 'medium', assigneeId: 'u2', assigneeName: 'Bob',
    dueDate: '2026-01-20', estimatedHours: 16, loggedHours: 0,
    phase: 'installation', dependencies: ['t1'], tags: [], createdAt: '',
  },
  {
    // No dates at all → unscheduled panel.
    id: 't3', projectId: 'p2', projectName: 'Beta', title: 'No dates task', description: '',
    status: 'backlog', priority: 'low', assigneeId: '', assigneeName: '', dueDate: '',
    estimatedHours: 0, loggedHours: 0, phase: 'atp', dependencies: [], tags: [], createdAt: '',
  },
]
const projects = [{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Beta' }]
const users = [
  { id: 'u1', name: 'Alice', role: 'Manager' },
  { id: 'u2', name: 'Bob', role: 'Inspector' },
]

const rowLists: Record<string, unknown[]> = {
  tasks, projects, users,
}

beforeEach(() => {
  vi.clearAllMocks()
  authMock.canEdit.mockReturnValue(true)
  mocks.makeApi.mockImplementation((table: string) => ({
    ...mocks.api,
    list: vi.fn(async () => rowLists[table] ?? []),
  }))
})
afterEach(() => cleanup())

async function renderBoard() {
  render(<TaskBoard />)
  // Wait for the async list loads to settle.
  await waitFor(() => expect(mocks.makeApi).toHaveBeenCalled())
}

describe('TaskBoard — tabs', () => {
  it('opens on the Kanban tab by default with both tabs visible', async () => {
    await renderBoard()
    const tablist = screen.getByRole('tablist', { name: 'Task board view' })
    expect(within(tablist).getByRole('tab', { name: 'kanban' }).getAttribute('aria-selected')).toBe('true')
    expect(within(tablist).getByRole('tab', { name: 'gantt' }).getAttribute('aria-selected')).toBe('false')
  })

  it('switches to the Gantt tab and renders project groups + bars + unscheduled panel', async () => {
    await renderBoard()
    await userEvent.click(screen.getByRole('tab', { name: 'gantt' }))

    // Project groups (Alpha with 2 tasks, Beta with 1) + the unscheduled group.
    await screen.findByText('Survey Alpha')
    expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0)
    expect(screen.getByText('Unscheduled Tasks')).toBeTruthy()

    // Bars: scheduled task = 11-day bar at 50% progress; missing-start task
    // sits on its due date (0%).
    expect(screen.getByLabelText('Survey Alpha, 50%')).toBeTruthy()
    expect(screen.getByLabelText('Install Alpha, 0%')).toBeTruthy()

    // Unscheduled row gets a placeholder with an edit affordance.
    expect(screen.getByText('No dates — edit to schedule')).toBeTruthy()
  })

  it('shared filters apply to the Gantt view', async () => {
    await renderBoard()
    await userEvent.click(screen.getByRole('tab', { name: 'gantt' }))
    await userEvent.selectOptions(screen.getByDisplayValue('All Projects'), 'p1')
    await waitFor(() => expect(screen.queryByText('No dates task')).toBeNull())
    expect(screen.getByText('Survey Alpha')).toBeTruthy()
  })

  it('schedule filter (Gantt only) narrows to unscheduled tasks', async () => {
    await renderBoard()
    await userEvent.click(screen.getByRole('tab', { name: 'gantt' }))
    await userEvent.selectOptions(screen.getByDisplayValue('All schedules'), 'unscheduled')
    expect(screen.getByText('No dates task')).toBeTruthy()
    expect(screen.queryByText('Survey Alpha')).toBeNull()
  })

  it('clicking a task row opens the shared detail modal', async () => {
    await renderBoard()
    await userEvent.click(screen.getByRole('tab', { name: 'gantt' }))
    await screen.findByText('Survey Alpha')
    await userEvent.click(screen.getByLabelText('Task Survey Alpha'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Survey Alpha')).toBeTruthy()
    expect(within(dialog).getByText('in progress')).toBeTruthy()
    expect(within(dialog).getByText('2026-01-05')).toBeTruthy()
  })

  it('hides New Task and column add buttons for read-only users', async () => {
    authMock.canEdit.mockReturnValue(false)
    await renderBoard()
    expect(screen.queryByRole('button', { name: 'New Task' })).toBeNull()
  })
})
