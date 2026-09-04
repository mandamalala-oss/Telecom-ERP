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

  // A milestone is represented by one date in the timeline even if a legacy
  // row has inconsistent dates stored underneath it.
  if (task.isMilestone) {
    const date = task.startDate || task.dueDate
    if (!date) return { schedule: 'unscheduled', startDay: null, endDay: null, dayCount: 0, progress, overdue: false }
    const day = parseDay(date)
    return { schedule: 'scheduled', startDay: day, endDay: day, dayCount: 1, progress, overdue }
  }

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
    // Sort siblings first (start/due/priority/title), then nest children under
    // their parents so the timeline shows a proper outline (parents first).
    g.tasks.sort((a, b) => {
      const d = (a.resolved.startDay ?? 0) - (b.resolved.startDay ?? 0)
      if (d !== 0) return d
      const e = (a.resolved.endDay ?? 0) - (b.resolved.endDay ?? 0)
      if (e !== 0) return e
      const p = PRIORITY_ORDER[a.task.priority] - PRIORITY_ORDER[b.task.priority]
      if (p !== 0) return p
      return a.task.title.localeCompare(b.task.title)
    })
    const byId = new Map(g.tasks.map((rt) => [rt.task.id!, rt]))
    g.tasks = orderByHierarchy(g.tasks.map((rt) => rt.task)).map((t) => byId.get(t.id!)!).filter(Boolean)
  }
  return { groups, unscheduled: orderByHierarchy(unscheduled.map((rt) => rt.task)).map((t) => unscheduled.find((rt) => rt.task.id === t.id)!) }
}

// ── Task hierarchy (parent/child) ───────────────────────────────────────────

export interface TaskHierarchy {
  /** Task id → nesting depth (0 = top-level, children are deeper). */
  depth: Map<string, number>
  /** Parent id → ordered child ids. */
  children: Map<string, string[]>
}

/**
 * Derive nesting depth and child lists from each task's `parentId`. Depth is
 * memoized per id and guarded against cycles so a cyclic `parentId` graph
 * terminates (cyclic nodes get a bounded, arbitrary depth rather than
 * recursing forever).
 */
export function buildTaskHierarchy(tasks: { id?: string; parentId?: string }[]): TaskHierarchy {
  const parentOf = new Map<string, string>()
  const children = new Map<string, string[]>()
  for (const task of tasks) {
    if (!task.id || !task.parentId) continue
    parentOf.set(task.id, task.parentId)
    const list = children.get(task.parentId) ?? []
    list.push(task.id)
    children.set(task.parentId, list)
  }

  const depth = new Map<string, number>()
  const visiting = new Set<string>()
  const getDepth = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!
    const parent = parentOf.get(id)
    if (!parent || visiting.has(id)) {
      depth.set(id, 0)
      return 0
    }
    visiting.add(id)
    const d = getDepth(parent) + 1
    visiting.delete(id)
    depth.set(id, d)
    return d
  }

  for (const task of tasks) if (task.id) getDepth(task.id)
  return { depth, children }
}

// ── Summary rollup (parent tasks behave like MS Project summaries) ─────────

/** A parent/summary task's status is derived from its children, not set by
 * hand: done only when every child is done, todo while nothing has started,
 * review when all children are in review, otherwise in progress. */
export function rollupStatus(statuses: TaskStatus[]): TaskStatus {
  if (statuses.length === 0) return 'todo'
  if (statuses.every((s) => s === 'done')) return 'done'
  if (statuses.every((s) => s === 'backlog' || s === 'todo')) return 'todo'
  if (statuses.every((s) => s === 'review')) return 'review'
  return 'in_progress'
}

export interface TaskRollup {
  /** Effective status: the task's own for a leaf, rolled up for a parent. */
  status: TaskStatus
  /** Effective cost: own cost for a leaf, sum of descendants for a parent. */
  cost: number
  /** People assigned across the subtree (deduped, order of first appearance). */
  resources: string[]
  /** True when the task has subtasks (renders as an MS Project summary). */
  isParent: boolean
}

/**
 * Compute per-task rollups (status/cost/resources/isParent) in one memoized
 * pass. Leaf values come from the task itself; parent values aggregate their
 * children recursively. Cyclic parent links are guarded and treated as leaves.
 */
export function computeTaskRollups(tasks: Task[]): Map<string, TaskRollup> {
  const { children } = buildTaskHierarchy(tasks)
  const byId = new Map(tasks.map((t) => [t.id!, t]))
  const memo = new Map<string, TaskRollup>()
  const visiting = new Set<string>()

  const rollup = (id: string): TaskRollup => {
    if (memo.has(id)) return memo.get(id)!
    const task = byId.get(id)
    const kids = children.get(id) ?? []
    if (kids.length === 0 || visiting.has(id)) {
      const r: TaskRollup = {
        status: task?.status ?? 'todo',
        cost: task?.cost ?? 0,
        resources: task?.assigneeName ? [task.assigneeName] : [],
        isParent: kids.length > 0,
      }
      memo.set(id, r)
      return r
    }
    visiting.add(id)
    const childRollups = kids.map((k) => rollup(k))
    visiting.delete(id)
    const r: TaskRollup = {
      status: rollupStatus(childRollups.map((c) => c.status)),
      cost: childRollups.reduce((sum, c) => sum + c.cost, 0),
      resources: [...new Set(childRollups.flatMap((c) => c.resources))],
      isParent: true,
    }
    memo.set(id, r)
    return r
  }

  for (const task of tasks) if (task.id) rollup(task.id)
  return memo
}

/**
 * Order tasks so every parent is immediately followed by its subtasks (a
 * depth-first outline walk). Sibling order is preserved (callers pre-sort by
 * date/priority first). Tasks whose parent is missing become roots; cyclic
 * links are emitted once to avoid an infinite loop.
 */
export function orderByHierarchy<T extends { id?: string; parentId?: string }>(tasks: T[]): T[] {
  const { children } = buildTaskHierarchy(tasks)
  const byId = new Map(tasks.map((t) => [t.id!, t]))
  const roots = tasks.filter((t) => !t.parentId || !byId.has(t.parentId)).map((t) => t.id!)
  const result: T[] = []
  const visited = new Set<string>()
  const visit = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)
    const task = byId.get(id)
    if (task) result.push(task)
    for (const childId of children.get(id) ?? []) visit(childId)
  }
  for (const id of roots) visit(id)
  for (const task of tasks) if (!visited.has(task.id!)) result.push(task)
  return result
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

/** Human-readable save guard for a candidate task against the current list. */
export function dependencyCycleMessage(tasks: Task[], candidate: Task, editingId?: string): string | null {
  const next = editingId
    ? tasks.map((task) => task.id === editingId ? candidate : task)
    : [...tasks, candidate]
  const cycles = findDependencyCycles(next)
  if (cycles.length === 0) return null
  const names = cycles[0].map((id) => next.find((task) => task.id === id)?.title ?? id)
  return `Cannot save: dependency cycle detected (${names.join(' → ')})`
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

/**
 * Return tasks on the longest dependency chain. This is a forward/backward
 * CPM pass over valid, date-bearing tasks; missing dependency ids are ignored
 * here (the UI reports them separately) and cycles return an empty set.
 */
export function computeCriticalPath(tasks: Task[]): Set<string> {
  const nodes = tasks
    .filter((task) => task.id && resolveTaskDates(task).startDay != null && resolveTaskDates(task).schedule !== 'invalidRange')
    .map((task) => ({ task, resolved: resolveTaskDates(task) }))
  const ids = new Set(nodes.map(({ task }) => task.id!))
  const byId = new Map(nodes.map(({ task, resolved }) => [task.id!, { task, resolved }]))
  const successors = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const id of ids) { successors.set(id, []); indegree.set(id, 0) }
  for (const { task } of nodes) {
    for (const dependency of task.dependencies ?? []) {
      if (!ids.has(dependency)) continue
      successors.get(dependency)!.push(task.id!)
      indegree.set(task.id!, indegree.get(task.id!)! + 1)
    }
  }

  const queue = [...ids].filter((id) => indegree.get(id) === 0)
  const order: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const successor of successors.get(id) ?? []) {
      const next = indegree.get(successor)! - 1
      indegree.set(successor, next)
      if (next === 0) queue.push(successor)
    }
  }
  if (order.length !== ids.size) return new Set()

  const earliestStart = new Map<string, number>()
  const earliestFinish = new Map<string, number>()
  for (const id of order) {
    const predecessors = byId.get(id)!.task.dependencies ?? []
    const start = Math.max(0, ...predecessors
      .filter((dependency) => ids.has(dependency))
      .map((dependency) => earliestFinish.get(dependency) ?? 0))
    const finish = start + byId.get(id)!.resolved.dayCount
    earliestStart.set(id, start)
    earliestFinish.set(id, finish)
  }

  const projectFinish = Math.max(...order.map((id) => earliestFinish.get(id)!))
  const latestFinish = new Map<string, number>()
  const latestStart = new Map<string, number>()
  for (const id of [...order].reverse()) {
    const nextStarts = (successors.get(id) ?? []).map((successor) => latestStart.get(successor)!)
    const finish = nextStarts.length > 0 ? Math.min(...nextStarts) : projectFinish
    latestFinish.set(id, finish)
    latestStart.set(id, finish - byId.get(id)!.resolved.dayCount)
  }

  const critical = new Set<string>()
  for (const id of order) {
    if (latestStart.get(id)! - earliestStart.get(id)! === 0) critical.add(id)
  }
  return critical
}
