import { describe, it, expect } from 'vitest'
import {
  parseDay, formatDay, addDays, todayISO, daysBetween,
  resolveTaskDates, timelineRange, barPosition, buildTimelineRows,
  findDependencyCycles, findMissingDependencies, buildDependencyEdges,
} from './taskTimeline'
import type { Task } from '@/types'

// One shared task factory; only the fields a test cares about are overridden.
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    projectId: 'p1',
    projectName: 'Alpha',
    title: 'Task',
    description: '',
    status: 'todo',
    priority: 'medium',
    assigneeId: '',
    assigneeName: '',
    dueDate: '',
    estimatedHours: 0,
    loggedHours: 0,
    phase: 'survey',
    dependencies: [],
    tags: [],
    createdAt: '',
    ...overrides,
  }
}

describe('date helpers', () => {
  it('parseDay/formatDay round-trip without timezone drift', () => {
    for (const iso of ['2026-01-01', '2026-08-27', '2024-02-29', '2025-12-31']) {
      expect(formatDay(parseDay(iso))).toBe(iso)
    }
  })

  it('parseDay counts consecutive days', () => {
    expect(parseDay('2026-01-02') - parseDay('2026-01-01')).toBe(1)
    expect(parseDay('2026-03-01') - parseDay('2026-02-28')).toBe(1)
  })

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-01-30', 5)).toBe('2026-02-04')
    expect(addDays('2026-12-30', 10)).toBe('2027-01-09')
  })

  it('daysBetween is inclusive', () => {
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(1)
    expect(daysBetween('2026-01-01', '2026-01-10')).toBe(10)
  })

  it('todayISO uses local date components', () => {
    // 2026-01-05 02:00 UTC → still Jan 5 in any positive offset; the local
    // getters make it stable regardless of the host timezone.
    expect(todayISO(new Date('2026-01-05T02:00:00Z'))).toBe('2026-01-05')
  })
})

describe('resolveTaskDates', () => {
  it('scheduled task: start..due inclusive with status-derived progress', () => {
    const r = resolveTaskDates(makeTask({ startDate: '2026-01-01', dueDate: '2026-01-10', status: 'in_progress' }))
    expect(r.schedule).toBe('scheduled')
    expect(r.startDay).toBe(parseDay('2026-01-01'))
    expect(r.endDay).toBe(parseDay('2026-01-10'))
    expect(r.dayCount).toBe(10)
    expect(r.progress).toBe(50)
  })

  it('missing start → 1-day bar on the due date', () => {
    const r = resolveTaskDates(makeTask({ dueDate: '2026-03-05' }))
    expect(r.schedule).toBe('missingStart')
    expect(r.startDay).toBe(parseDay('2026-03-05'))
    expect(r.endDay).toBe(r.startDay)
    expect(r.dayCount).toBe(1)
  })

  it('missing due → 1-day bar on the start date', () => {
    const r = resolveTaskDates(makeTask({ startDate: '2026-03-05' }))
    expect(r.schedule).toBe('missingEnd')
    expect(r.startDay).toBe(parseDay('2026-03-05'))
    expect(r.dayCount).toBe(1)
  })

  it('no dates → unscheduled, no bar', () => {
    const r = resolveTaskDates(makeTask())
    expect(r.schedule).toBe('unscheduled')
    expect(r.startDay).toBeNull()
    expect(r.endDay).toBeNull()
  })

  it('start after due → invalidRange, 1-day bar, never negative', () => {
    const r = resolveTaskDates(makeTask({ startDate: '2026-02-10', dueDate: '2026-02-01' }))
    expect(r.schedule).toBe('invalidRange')
    expect(r.dayCount).toBe(1)
  })

  it('overdue only when past due and not done', () => {
    const due = '2026-01-01'
    expect(resolveTaskDates(makeTask({ dueDate: due, status: 'todo' }), '2026-01-05').overdue).toBe(true)
    expect(resolveTaskDates(makeTask({ dueDate: due, status: 'done' }), '2026-01-05').overdue).toBe(false)
    expect(resolveTaskDates(makeTask({ dueDate: due, status: 'todo' }), '2026-01-01').overdue).toBe(false)
  })
})

describe('timelineRange / barPosition', () => {
  it('pads min/max task days (and today) by the default margin', () => {
    const tasks = [
      makeTask({ id: 'a', startDate: '2026-01-05', dueDate: '2026-01-20' }),
      makeTask({ id: 'b', startDate: '2026-02-02', dueDate: '2026-02-10' }),
    ]
    const r = timelineRange(tasks)
    // Today (2026-08-27 per repo clock) is beyond the tasks, so it drives max.
    expect(r.totalDays).toBe(r.endDay - r.startDay + 1)
    expect(r.startDay).toBeLessThanOrEqual(parseDay('2026-01-05'))
    expect(r.endDay).toBeGreaterThanOrEqual(parseDay('2026-02-10'))
  })

  it('empty task list still yields a padded window around today', () => {
    const r = timelineRange([])
    const today = parseDay(todayISO())
    expect(r.startDay).toBeLessThanOrEqual(today)
    expect(r.endDay).toBeGreaterThanOrEqual(today)
    expect(r.totalDays).toBeGreaterThan(0)
  })

  it('barPosition maps days to pixels', () => {
    expect(barPosition(parseDay('2026-01-03'), parseDay('2026-01-01'), 16)).toBe(32)
  })
})

describe('buildTimelineRows', () => {
  it('groups by project and sorts scheduled tasks by start date', () => {
    const tasks = [
      makeTask({ id: 'late', projectId: 'p1', projectName: 'Alpha', title: 'B', startDate: '2026-02-01', dueDate: '2026-02-03' }),
      makeTask({ id: 'early', projectId: 'p1', projectName: 'Alpha', title: 'A', startDate: '2026-01-01', dueDate: '2026-01-05' }),
      makeTask({ id: 'p2', projectId: 'p2', projectName: 'Beta', title: 'C', startDate: '2026-01-02', dueDate: '2026-01-04' }),
    ]
    const { groups, unscheduled } = buildTimelineRows(tasks)
    expect(groups.map((g) => g.projectName)).toEqual(['Alpha', 'Beta'])
    expect(groups[0].tasks.map((t) => t.task.id)).toEqual(['early', 'late'])
    expect(unscheduled).toHaveLength(0)
  })

  it('splits tasks without any date into the unscheduled list', () => {
    const { groups, unscheduled } = buildTimelineRows([
      makeTask({ id: 'a', startDate: '2026-01-01', dueDate: '2026-01-02' }),
      makeTask({ id: 'b' }),
    ])
    expect(groups[0].tasks.map((t) => t.task.id)).toEqual(['a'])
    expect(unscheduled.map((t) => t.task.id)).toEqual(['b'])
  })

  it('tasks without a project land in an "Other" group', () => {
    const { groups } = buildTimelineRows([makeTask({ projectId: '', projectName: '', startDate: '2026-01-01', dueDate: '2026-01-02' })])
    expect(groups[0].projectName).toBe('Other')
  })
})

describe('dependency helpers', () => {
  it('detects simple and multi-node cycles (deduped)', () => {
    const tasks = [
      makeTask({ id: 'a', dependencies: ['b'] }),
      makeTask({ id: 'b', dependencies: ['a'] }),
    ]
    const cycles = findDependencyCycles(tasks)
    expect(cycles).toHaveLength(1)
    expect(cycles[0].sort()).toEqual(['a', 'b', 'a'].sort())

    const self = findDependencyCycles([makeTask({ id: 'x', dependencies: ['x'] })])
    expect(self).toHaveLength(1)
    expect(self[0]).toEqual(['x', 'x'])
  })

  it('reports only dependencies on missing tasks', () => {
    const missing = findMissingDependencies([makeTask({ id: 'a', dependencies: ['gone'] })])
    expect(missing.get('a')).toEqual(['gone'])
    expect(findMissingDependencies([makeTask({ id: 'a', dependencies: ['b'] }), makeTask({ id: 'b' })]).size).toBe(0)
  })

  it('builds edges with violation flags (predecessor ends after successor starts)', () => {
    const edges = buildDependencyEdges([
      makeTask({ id: 'pre', title: 'Pre', startDate: '2026-01-01', dueDate: '2026-01-10' }),
      makeTask({ id: 'post', title: 'Post', dependencies: ['pre'], startDate: '2026-01-05', dueDate: '2026-01-08' }),
    ])
    expect(edges).toHaveLength(1)
    expect(edges[0].fromId).toBe('pre')
    expect(edges[0].toId).toBe('post')
    expect(edges[0].violated).toBe(true)

    const ok = buildDependencyEdges([
      makeTask({ id: 'pre', title: 'Pre', startDate: '2026-01-01', dueDate: '2026-01-10' }),
      makeTask({ id: 'post', title: 'Post', dependencies: ['pre'], startDate: '2026-01-11', dueDate: '2026-01-15' }),
    ])
    expect(ok[0].violated).toBe(false)
  })
})
