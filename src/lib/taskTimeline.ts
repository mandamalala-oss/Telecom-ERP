import type { Task, TaskStatus } from '@/types'

// Pure timeline helpers for the Task Board Gantt tab. All date math works on
// date-only 'YYYY-MM-DD' strings via UTC epoch days, so values are identical
// in every timezone (no Date parsing of local midnight — which is what makes
// the Kanban overdue check timezone-safe too).
const DAY_MS = 86_400_000

// ── Date helpers ────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' → integer epoch day (UTC-based, timezone-independent). */
export function parseDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)
}

/** Integer epoch day → 'YYYY-MM-DD'. */
export function formatDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

/** Add n days to a date-only string. */
export function addDays(iso: string, n: number): string {
  if (!iso) return iso
  return formatDay(parseDay(iso) + n)
}

/** Local 'YYYY-MM-DD' for a given Date (defaults to now). */
export function todayISO(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Inclusive day count between two date-only strings. */
export function daysBetween(startISO: string, endISO: string): number {
  return parseDay(endISO) - parseDay(startISO) + 1
}

// ── Progress / scheduling ───────────────────────────────────────────────────

// Progress is derived from status (no separate % field): a task is 0% in
// backlog/todo, halfway once started, 75% in review, done at 100%.
export const STATUS_PROGRESS: Record<TaskStatus, number> = {
  backlog: 0,
  todo: 0,
  in_progress: 50,
  review: 75,
  done: 100,
}

export type TaskScheduleStatus =
  | 'scheduled'      // start + due, valid range
  | 'missingStart'   // only a due date → 1-day bar on the due date
  | 'missingEnd'     // only a start date → 1-day bar on the start date
  | 'unscheduled'    // neither date → no bar, listed in the unscheduled panel
  | 'invalidRange'   // start > due → 1-day bar (visible, flagged), never negative

export interface ResolvedTaskDates {
  schedule: TaskScheduleStatus
  /** Bar start day (always set whenever a bar is rendered). */
  startDay: number | null
  /** Bar end day (inclusive). */
  endDay: number | null
  /** Inclusive bar length in days. */
  dayCount: number
  progress: number
  /** Past due date and not done. */
  overdue: boolean
}

export function resolveTaskDates(task: Task, today = todayISO()): ResolvedTaskDates {
  const progress = STATUS_PROGRESS[task.status] ?? 0
  const hasStart = !!task.startDate
  const hasEnd = !!task.dueDate
  const overdue = hasEnd && task.status !== 'done' && task.dueDate.slice(0, 10) < today

  if (!hasStart && !hasEnd) {
    return { schedule: 'unscheduled', startDay: null, endDay: null, dayCount: 0, progress, overdue: false }
  }
  if (hasStart && hasEnd) {
    const startDay = parseDay(task.startDate!)
    const endDay = parseDay(task.dueDate)
    if (startDay > endDay) {
      return { schedule: 'invalidRange', startDay, endDay: startDay, dayCount: 1, progress, overdue }
    }
    return { schedule: 'scheduled', startDay, endDay, dayCount: endDay - startDay + 1, progress, overdue }
  }
  if (hasStart) {
    const startDay = parseDay(task.startDate!)
    return { schedule: 'missingEnd', startDay, endDay: startDay, dayCount: 1, progress, overdue: false }
  }
  const endDay = parseDay(task.dueDate)
  return { schedule: 'missingStart', startDay: endDay, endDay, dayCount: 1, progress, overdue }
}

// ── Timeline range ──────────────────────────────────────────────────────────

export interface TimelineRange {
  startDay: number
  /** Inclusive. */
  endDay: number
  totalDays: number
}

/** Bounds of the visible timeline: min/max task day and today, padded. */
export function timelineRange(tasks: Task[], paddingDays = 7): TimelineRange {
  const days = tasks
    .map((t) => resolveTaskDates(t))
    .filter((r) => r.startDay != null)
  const today = parseDay(todayISO())
  if (days.length === 0) {
    return { startDay: today - paddingDays, endDay: today + paddingDays, totalDays: paddingDays * 2 + 1 }
  }
  const min = Math.min(...days.map((d) => d.startDay!))
  const max = Math.max(...days.map((d) => d.endDay ?? d.startDay!))
  const start = Math.min(min, today) - paddingDays
  const end = Math.max(max, today) + paddingDays
  return { startDay: start, endDay: end, totalDays: end - start + 1 }
}

/** Left offset in px of a bar whose start day is `startDay`. */
export function barPosition(startDay: number, rangeStartDay: number, dayWidth: number): number {
  return (startDay - rangeStartDay) * dayWidth
}

// ── Rows / grouping ─────────────────────────────────────────────────────────

export interface TimelineTask {
  task: Task
  resolved: ResolvedTaskDates
}

export interface TaskGroup {
  projectId: string
  projectName: string
  tasks: TimelineTask[]
}

const PRIORITY_ORDER: Record<Task['priority'], number> = { low: 0, medium: 1, high: 2, critical: 3 }

/**
 * Split tasks into per-project groups (tasks with ≥1 date) plus an
 * "unscheduled" list (no dates at all). Within a group: by start day, then
 * due day, then priority, then title.
 */
export function buildTimelineRows(tasks: Task[]): { groups: TaskGroup[]; unscheduled: TimelineTask[] } {
  const withDates: TimelineTask[] = []
  const unscheduled: TimelineTask[] = []
  for (const task of tasks) {
    const resolved = resolveTaskDates(task)
    if (resolved.startDay == null) unscheduled.push({ task, resolved })
    else withDates.push({ task, resolved })
  }

  const groups: TaskGroup[] = []
  const byProject = new Map<string, TaskGroup>()
  for (const rt of withDates) {
    const key = rt.task.projectId || rt.task.projectName || 'Other'
    let group = byProject.get(key)
    if (!group) {
      group = { projectId: rt.task.projectId ?? '', projectName: rt.task.projectName || 'Other', tasks: [] }
      byProject.set(key, group)
      groups.push(group)
    }
    group.tasks.push(rt)
  }
  for (const g of groups) {
    g.tasks.sort((a, b) => {
      const d = (a.resolved.startDay ?? 0) - (b.resolved.startDay ?? 0)
      if (d !== 0) return d
      const e = (a.resolved.endDay ?? 0) - (b.resolved.endDay ?? 0)
      if (e !== 0) return e
      const p = PRIORITY_ORDER[a.task.priority] - PRIORITY_ORDER[b.task.priority]
      if (p !== 0) return p
      return a.task.title.localeCompare(b.task.title)
    })
  }
  return { groups, unscheduled }
}

// ── Dependencies ────────────────────────────────────────────────────────────

/** All simple cycles in the task dependency graph (each an ordered id path
 * with the repeated start id appended, e.g. ['a','b','a']). */
export function findDependencyCycles(tasks: Task[]): string[][] {
  const byId = new Map(tasks.map((t) => [t.id!, t]))
  const cycles: string[][] = []
  const seen = new Set<string>()
  const visited = new Set<string>()

  const dfs = (id: string, path: string[]) => {
    const idx = path.indexOf(id)
    if (idx !== -1) {
      // Cycle found: record it (deduped by sorted id set) and keep exploring
      // the remaining deps — a node can sit on several cycles.
      const cycle = path.slice(idx).concat(id)
      const key = [...cycle].sort().join('|')
      if (!seen.has(key)) {
        seen.add(key)
        cycles.push(cycle)
      }
      return
    }
    if (visited.has(id)) return
    path.push(id)
    visited.add(id)
    for (const dep of byId.get(id)?.dependencies ?? []) {
      if (byId.has(dep)) dfs(dep, path)
    }
    path.pop()
  }

  for (const t of tasks) {
    if (t.id) dfs(t.id, [])
  }
  return cycles
}

/** tasks whose `dependencies` reference ids that don't exist (anymore). */
export function findMissingDependencies(tasks: Task[]): Map<string, string[]> {
  const ids = new Set(tasks.map((t) => t.id))
  const out = new Map<string, string[]>()
  for (const t of tasks) {
    const missing = (t.dependencies ?? []).filter((d) => !ids.has(d))
    if (missing.length > 0) out.set(t.id!, missing)
  }
  return out
}

export interface DependencyEdge {
  fromId: string
  toId: string
  /** Predecessor's end day (bar right edge). */
  fromEndDay: number | null
  /** Successor's start day (bar left edge). */
  toStartDay: number | null
  /** Predecessor finishes after the successor starts (red flag). */
  violated: boolean
}

/** Directed edges task → dependency, ready for connector drawing. */
export function buildDependencyEdges(tasks: Task[]): DependencyEdge[] {
  const byId = new Map(tasks.map((t) => [t.id!, t]))
  const resolved = new Map(tasks.map((t) => [t.id!, resolveTaskDates(t)]))
  const edges: DependencyEdge[] = []
  for (const t of tasks) {
    for (const dep of t.dependencies ?? []) {
      if (!byId.has(dep)) continue
      const from = resolved.get(dep)!
      const to = resolved.get(t.id!)!
      const fromEndDay = from.endDay ?? from.startDay
      const toStartDay = to.startDay ?? to.endDay
      edges.push({
        fromId: dep,
        toId: t.id!,
        fromEndDay,
        toStartDay,
        violated: fromEndDay != null && toStartDay != null && fromEndDay > toStartDay,
      })
    }
  }
  return edges
}
