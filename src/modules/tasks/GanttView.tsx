import { useMemo, useRef, useState } from 'react'
import { ChevronRight, Link2, Maximize2, Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  buildTimelineRows, buildDependencyEdges, parseDay, formatDay, todayISO,
  timelineRange, barPosition, resolveTaskDates, computeCriticalPath, buildTaskHierarchy,
  STATUS_PROGRESS,
  type TimelineTask, type ResolvedTaskDates, type TaskScheduleStatus, type TaskRollup,
} from '@/lib/taskTimeline'
import type { Task, TaskStatus } from '@/types'

const ROW_H = 40
const GROUP_H = 32
const BAR_H = 22
const SUMMARY_H = 10
const HDR_H = 44
const LEFT_W = 300

// Zoom = pixels per day. Week is the default; Day for fine detail, Month for
// a whole-project overview.
const ZOOMS = [
  { key: 'month', label: 'Month', px: 8 },
  { key: 'week',  label: 'Week',  px: 16 },
  { key: 'day',   label: 'Day',   px: 30 },
] as const

// Track/fill pairs match the Kanban column colors so the two tabs read
// consistently. Progress = fill width (derived from status).
const BAR_STYLE: Record<TaskStatus, { track: string; fill: string }> = {
  backlog:     { track: 'bg-slate-200 dark:bg-slate-700',     fill: 'bg-slate-400 dark:bg-slate-500' },
  todo:        { track: 'bg-blue-100 dark:bg-blue-900/40',    fill: 'bg-blue-500' },
  in_progress: { track: 'bg-amber-100 dark:bg-amber-900/40',  fill: 'bg-amber-500' },
  review:      { track: 'bg-purple-100 dark:bg-purple-900/40',fill: 'bg-purple-500' },
  done:        { track: 'bg-green-100 dark:bg-green-900/40',  fill: 'bg-green-500' },
}

const PRIORITY_ACCENT: Partial<Record<Task['priority'], string>> = {
  high: 'bg-amber-400', critical: 'bg-red-500',
}

// Visual treatment for bars whose dates are incomplete or contradictory.
const WARNING_FLAGS: Record<TaskScheduleStatus, string> = {
  scheduled: '',
  missingStart: 'border-2 border-dashed border-amber-400',
  missingEnd: 'border-2 border-dashed border-amber-400',
  invalidRange: 'border-2 border-red-500',
  unscheduled: '',
}

const fmtDay = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })

const fmtMonth = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' })

const fmtMoney = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M Ar` : `${n.toLocaleString()} Ar`)

interface GanttViewProps {
  tasks: Task[]
  /** Open the shared task detail modal. */
  onSelect: (task: Task) => void
  /** Open the shared task edit form (e.g. "Set dates" from an unscheduled row). */
  onEdit: (task: Task) => void
  editable: boolean
  /** Per-task rollups; parents render as MS Project summaries. */
  rollups?: Map<string, TaskRollup>
}

/** Rows and their y offsets inside the timeline, computed in one pass so the
 *  sticky task panel, the bars, and the dependency connectors all align. */
interface LayoutRow { task: Task; resolved: ReturnType<typeof resolveTaskDates>; groupKey: string; y: number }
interface LayoutGroup { key: string; name: string; y: number; rowCount: number; collapsed: boolean }

export function GanttView({ tasks, onSelect, onEdit, editable, rollups }: GanttViewProps) {
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]['key']>('week')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCriticalPath, setShowCriticalPath] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const dayWidth = ZOOMS.find((z) => z.key === zoom)!.px

  const { groups: projectGroups, unscheduled } = useMemo(() => buildTimelineRows(tasks), [tasks])
  const range = useMemo(() => timelineRange(tasks), [tasks])
  const edges = useMemo(() => buildDependencyEdges(tasks), [tasks])
  const criticalPath = useMemo(() => computeCriticalPath(tasks), [tasks])
  const hierarchy = useMemo(() => buildTaskHierarchy(tasks), [tasks])
  const todayDay = parseDay(todayISO())

  const statusOf = (task: Task): TaskStatus => rollups?.get(task.id!)?.status ?? task.status
  const costOf = (task: Task): number => rollups?.get(task.id!)?.cost ?? (task.cost ?? 0)
  const isParent = (task: Task): boolean => rollups?.get(task.id!)?.isParent ?? (hierarchy.children.get(task.id!) ?? []).length > 0

  // Flat layout (group headers + rows) shared by the left panel, the bars and
  // the connectors. The unscheduled list renders as a final "Unscheduled
  // Tasks" group so it can be collapsed too.
  const { groups, rows, contentY } = useMemo(() => {
    const groups: LayoutGroup[] = []
    const rows: LayoutRow[] = []
    let y = 0
    const pushGroup = (key: string, name: string, list: TimelineTask[]) => {
      const isCollapsed = collapsed.has(key)
      groups.push({ key, name, y, rowCount: list.length, collapsed: isCollapsed })
      y += GROUP_H
      if (isCollapsed) return
      for (const rt of list) {
        rows.push({ task: rt.task, resolved: rt.resolved, groupKey: key, y })
        y += ROW_H
      }
    }
    for (const g of projectGroups) pushGroup(g.projectId || g.projectName || 'Other', g.projectName, g.tasks)
    if (unscheduled.length > 0) pushGroup('unscheduled', 'Unscheduled Tasks', unscheduled)
    return { groups, rows, contentY: y }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectGroups, unscheduled, collapsed])

  const rowY = useMemo(() => new Map(rows.map((r) => [r.task.id!, r.y])), [rows])
  const totalWidth = range.totalDays * dayWidth
  const contentHeight = HDR_H + contentY

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // Month segments for the header (second row shows each day-of-month).
  const months: { key: string; label: string; startDay: number; days: number }[] = []
  {
    let cur: (typeof months)[number] | null = null
    for (let d = range.startDay; d <= range.endDay; d++) {
      const key = formatDay(d).slice(0, 7)
      if (!cur || cur.key !== key) {
        cur = { key, label: fmtMonth(`${key}-01`), startDay: d, days: 0 }
        months.push(cur)
      }
      cur.days++
    }
  }

  const barBox = (rt: ResolvedTaskDates) => ({
    left: barPosition(rt.startDay ?? rt.endDay ?? 0, range.startDay, dayWidth),
    width: Math.max(rt.dayCount * dayWidth, 6),
  })

  const tooltip = (t: Task): string => {
    const r = resolveTaskDates(t)
    const status = statusOf(t)
    const lines = [t.title]
    if (t.projectName) lines.push(`Project: ${t.projectName}`)
    lines.push(`Status: ${status.replace(/_/g, ' ')} · ${STATUS_PROGRESS[status]}%`)
    if (t.startDate) lines.push(`Start: ${fmtDay(t.startDate)}`)
    if (t.dueDate) lines.push(`Due: ${fmtDay(t.dueDate)}${r.overdue ? ' (overdue)' : ''}`)
    if (r.schedule === 'missingStart') lines.push('⚠ No start date — bar sits on the due date')
    if (r.schedule === 'missingEnd') lines.push('⚠ No due date')
    if (r.schedule === 'invalidRange') lines.push('⚠ Start date is after the due date')
    if ((t.dependencies ?? []).length > 0) {
      const deps = (t.dependencies ?? []).map((d) => tasks.find((x) => x.id === d)?.title ?? d).join(', ')
      lines.push(`Depends on: ${deps}`)
    }
    return lines.join('\n')
  }

  const scrollToToday = () => {
    const left = barPosition(todayDay, range.startDay, dayWidth) - 120
    scrollRef.current?.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }

  return (
    <div className="space-y-3">
      {/* Toolbar: zoom + today + legend */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {ZOOMS.map((z) => (
            <button
              key={z.key}
              onClick={() => setZoom(z.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-all ${
                zoom === z.key ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" icon={<Maximize2 className="w-4 h-4" />} onClick={scrollToToday}>Today</Button>
        <button
          type="button"
          aria-pressed={showCriticalPath}
          onClick={() => setShowCriticalPath((value) => !value)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${showCriticalPath ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300' : 'border-slate-200 dark:border-slate-600 text-slate-500'}`}
        >
          {showCriticalPath ? 'Hide critical path' : 'Show critical path'}
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          {Object.entries(BAR_STYLE).map(([s, c]) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`w-3 h-2 rounded-sm ${c.fill}`} />
              <span className="capitalize">{s.replace('_', ' ')}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div ref={scrollRef} className="overflow-x-auto">
          <div className="flex min-h-full">
            {/* Sticky task info panel */}
            <div className="sticky left-0 z-30 w-[300px] flex-shrink-0 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" style={{ width: LEFT_W }}>
              <div style={{ height: HDR_H }} className="flex items-center px-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 border-b border-slate-200 dark:border-slate-700">
                Task · Assignee · Dates
              </div>
              {groups.map((g) => (
                <div key={g.key}>
                  <button
                    onClick={() => toggleGroup(g.key)}
                    style={{ height: GROUP_H }}
                    className="w-full flex items-center gap-1.5 px-3 bg-slate-100 dark:bg-slate-800/60 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                  >
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${g.collapsed ? '' : 'rotate-90'}`} />
                    <span className="truncate flex-1 text-left">{g.name}</span>
                    <span className="text-[10px] font-semibold text-slate-400">{g.rowCount}</span>
                  </button>
                  {!g.collapsed && rows
                    .filter((r) => r.groupKey === g.key)
                    .map((r) => {
                      const depth = hierarchy.depth.get(r.task.id!) ?? 0
                      const hasChildren = (hierarchy.children.get(r.task.id!) ?? []).length > 0
                      const parent = isParent(r.task)
                      const resources = parent ? (rollups?.get(r.task.id!)?.resources ?? []) : (r.task.assigneeName ? [r.task.assigneeName] : [])
                      const cost = costOf(r.task)
                      return (
                      <div
                        key={r.task.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Task ${r.task.title}`}
                        onClick={() => { setSelectedId(r.task.id!); onSelect(r.task) }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(r.task.id!); onSelect(r.task) } }}
                        style={{ height: ROW_H, paddingLeft: 12 + depth * 16 }}
                        className={`flex flex-col justify-center gap-0.5 pr-3 border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-colors ${
                          selectedId === r.task.id ? 'bg-brand-50 dark:bg-brand-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className={`text-xs truncate flex-1 ${hasChildren ? 'font-bold text-slate-900 dark:text-slate-50' : 'font-semibold text-slate-800 dark:text-slate-100'}`}>{r.task.title}</p>
                          <Badge status={statusOf(r.task)} className="text-[10px]" />
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 min-w-0">
                          {r.resolved.startDay != null ? (
                            <span className="truncate">
                              {fmtDay(formatDay(r.resolved.startDay))}
                              {r.resolved.endDay !== r.resolved.startDay && ` → ${fmtDay(formatDay(r.resolved.endDay!))}`}
                            </span>
                          ) : (
                            <span className="text-amber-500 font-semibold">No dates set</span>
                          )}
                          <span>·</span>
                          <span className="truncate">{resources.join(', ') || 'Unassigned'}</span>
                          {cost > 0 && (
                            <>
                              <span>·</span>
                              <span className="font-semibold text-slate-500">{fmtMoney(cost)}</span>
                            </>
                          )}
                          {(r.task.estimatedHours ?? 0) > 0 && (
                            <>
                              <span>·</span>
                              <span>{r.task.loggedHours}h/{r.task.estimatedHours}h</span>
                            </>
                          )}
                        </div>
                      </div>
                      )
                    })}
                </div>
              ))}
              {groups.length === 0 && (
                <div className="p-6 text-sm text-slate-400">No tasks to display.</div>
              )}
            </div>

            {/* Timeline */}
            <div className="relative flex-shrink-0" style={{ width: totalWidth, minHeight: contentHeight }}>
              {/* Month / day header */}
              <div className="absolute top-0 left-0 right-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" style={{ height: HDR_H }}>
                <div className="flex" style={{ height: 20 }}>
                  {months.map((m) => (
                    <div key={m.key} className="flex items-center px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide" style={{ width: m.days * dayWidth }}>
                      {m.label}
                    </div>
                  ))}
                </div>
                <div className="flex" style={{ height: HDR_H - 20 }}>
                  {Array.from({ length: range.totalDays }, (_, i) => {
                    const day = range.startDay + i
                    return (
                      <div key={day} className="flex items-center justify-center text-[9px] text-slate-400 border-l border-slate-100 dark:border-slate-800" style={{ width: dayWidth }}>
                        {Number(formatDay(day).slice(8))}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Today marker */}
              <div className="absolute top-0 bottom-0 w-px bg-red-400/80 pointer-events-none z-10" style={{ left: barPosition(todayDay, range.startDay, dayWidth) }}>
                <span className="absolute -top-0.5 -translate-x-1/2 text-[9px] font-bold text-red-500 bg-red-50 dark:bg-red-900/30 px-1 rounded">Today</span>
              </div>

              {/* Group bands */}
              {groups.map((g) => (
                <div key={g.key} className="absolute left-0 right-0 bg-slate-50/80 dark:bg-slate-800/30 pointer-events-none" style={{ top: HDR_H + g.y, height: GROUP_H }} />
              ))}

              {/* Bars */}
              {rows.filter((r) => r.resolved.startDay != null).map((r) => {
                const { left, width } = barBox(r.resolved)
                const status = statusOf(r.task)
                const progress = STATUS_PROGRESS[status] ?? 0
                const s = BAR_STYLE[status]
                const accent = PRIORITY_ACCENT[r.task.priority]
                const warn = WARNING_FLAGS[r.resolved.schedule]
                const top = HDR_H + r.y + (ROW_H - BAR_H) / 2
                const isCritical = showCriticalPath && criticalPath.has(r.task.id!)
                const isMilestone = !!r.task.isMilestone
                const parent = isParent(r.task)
                const overdue = !!r.task.dueDate && status !== 'done' && r.task.dueDate.slice(0, 10) < todayISO()
                const diamondSize = 14
                const summaryBar = parent && !isMilestone
                return (
                  <div
                    key={r.task.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${r.task.title}, ${progress}%`}
                    title={tooltip(r.task)}
                    onClick={() => { setSelectedId(r.task.id!); onSelect(r.task) }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(r.task.id!); onSelect(r.task) } }}
                    className={`absolute cursor-pointer transition-shadow hover:shadow-md ${isMilestone ? 'overflow-visible' : 'overflow-hidden rounded-md'} ${warn} ${isCritical ? 'ring-2 ring-red-500' : ''} ${selectedId === r.task.id ? 'ring-2 ring-brand-500' : ''}`}
                    style={{ left: isMilestone ? left + width / 2 - diamondSize / 2 : left, top: isMilestone ? HDR_H + r.y + (ROW_H - diamondSize) / 2 : summaryBar ? HDR_H + r.y + (ROW_H - SUMMARY_H) / 2 : top, width: isMilestone ? diamondSize : width, height: isMilestone ? diamondSize : summaryBar ? SUMMARY_H : BAR_H }}
                  >
                    {isMilestone ? (
                      <div className={`w-3.5 h-3.5 rotate-45 rounded-sm ${isCritical ? 'bg-red-500' : s.fill} ${selectedId === r.task.id ? 'ring-2 ring-brand-500 ring-offset-1' : ''}`} />
                    ) : summaryBar ? (
                      <div className="relative w-full h-full">
                        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] bg-slate-700 dark:bg-slate-300" />
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-t-slate-700 dark:border-t-slate-300 border-l-transparent border-r-transparent" />
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-t-slate-700 dark:border-t-slate-300 border-l-transparent border-r-transparent" />
                      </div>
                    ) : (
                      <>
                        <div className={`h-full ${s.track}`}>
                          <div className={`h-full ${s.fill} opacity-90`} style={{ width: `${progress}%` }} />
                        </div>
                        {accent && <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />}
                        {overdue && <div className="absolute right-0 top-0 bottom-0 w-1 bg-red-500" />}
                        {(r.task.dependencies ?? []).length > 0 && width >= 40 && (
                          <Link2 className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-white drop-shadow" />
                        )}
                      </>
                    )}
                  </div>
                )
              })}

              {/* Unscheduled placeholders (no bar to draw) */}
              {rows.filter((r) => r.resolved.startDay == null).map((r) => (
                <div
                  key={r.task.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${r.task.title}, no dates`}
                  onClick={() => { setSelectedId(r.task.id!); onSelect(r.task) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(r.task.id!); onSelect(r.task) } }}
                  className="absolute left-2 right-2 flex items-center justify-between px-2 rounded-md border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10 cursor-pointer text-[10px] text-amber-600 dark:text-amber-400"
                  style={{ top: HDR_H + r.y + (ROW_H - 26) / 2, height: 26 }}
                >
                  <span className="flex items-center gap-1.5 truncate"><Calendar className="w-3 h-3 flex-shrink-0" /> No dates — edit to schedule</span>
                  {editable && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(r.task) }}
                      className="btn-secondary text-[10px] px-2 py-0.5 flex-shrink-0"
                    >
                      Set dates
                    </button>
                  )}
                </div>
              ))}

              {/* Dependency connectors (predecessor bar end → successor bar start) */}
              <svg className="absolute inset-0 pointer-events-none z-[5]" style={{ height: contentHeight, width: totalWidth }}>
                {edges.map((e, i) => {
                  const fromY = rowY.get(e.fromId)
                  const toY = rowY.get(e.toId)
                  if (fromY == null || toY == null) return null
                  const fromBox = rows.find((r) => r.task.id === e.fromId)
                  const toBox = rows.find((r) => r.task.id === e.toId)
                  if (!fromBox || !toBox || fromBox.resolved.startDay == null || toBox.resolved.startDay == null) return null
                  const fromX = barBox(fromBox.resolved).left + barBox(fromBox.resolved).width
                  const toX = barBox(toBox.resolved).left
                  const fromMid = HDR_H + fromY + ROW_H / 2
                  const toMid = HDR_H + toY + ROW_H / 2
                  const criticalEdge = showCriticalPath && criticalPath.has(e.fromId) && criticalPath.has(e.toId)
                  // Violated edges (predecessor ends after the successor
                  // starts) still render — red and dashed — so the conflict is
                  // visible instead of the connector silently vanishing.
                  return (
                    <path
                      key={i}
                      d={`M ${fromX} ${fromMid} H ${toX} V ${toMid}`}
                      fill="none"
                      stroke={e.violated || criticalEdge ? '#ef4444' : '#94a3b8'}
                      strokeWidth={criticalEdge ? 2.5 : 1.5}
                      strokeDasharray={e.violated ? '3 2' : undefined}
                    />
                  )
                })}
              </svg>

              {tasks.length === 0 && (
                <div className="absolute inset-x-0 text-center text-sm text-slate-400" style={{ top: HDR_H + 24 }}>
                  No tasks match the current filters.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
