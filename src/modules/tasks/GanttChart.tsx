import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Diamond } from 'lucide-react'
import type { Task, TaskStatus } from '@/types'

const STATUS_COLOR: Record<TaskStatus, string> = {
  backlog:     'bg-slate-400',
  todo:        'bg-blue-500',
  in_progress: 'bg-amber-500',
  review:      'bg-purple-500',
  done:        'bg-green-500',
}

// Approximate progress when a task has no explicit percentComplete — mirrors
// how MS Project derives "% Complete" from status when it hasn't been typed in.
const STATUS_PROGRESS: Record<TaskStatus, number> = {
  backlog: 0, todo: 0, in_progress: 50, review: 80, done: 100,
}

const DAY_MS = 86_400_000

function toDate(s?: string) {
  if (!s) return null
  const d = new Date(`${s.slice(0, 10)}T00:00:00`)
  return isNaN(d.getTime()) ? null : d
}
function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtShort(d: Date) {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}
function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * DAY_MS)
}
function isWeekend(d: Date) {
  const day = d.getDay()
  return day === 0 || day === 6
}
function daySpan(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1
}

interface Row {
  task: Task
  start: Date
  end: Date
  duration: number       // calendar days, inclusive
  percent: number        // 0-100
  isMilestone: boolean
  wbs: string
}

const DAY_WIDTHS = { compact: 20, comfortable: 32, wide: 48 }
type Zoom = keyof typeof DAY_WIDTHS

// ─── Critical path (simplified CPM over calendar days) ─────────────────────
// Forward pass gives the earliest finish for every task from its
// predecessors' durations; a backward pass from the overall project end
// gives the latest finish. Zero float (LS === ES) marks the critical chain,
// same idea MS Project uses to turn bars red.
function computeCriticalPath(rows: Row[]): Set<string> {
  const byId = new Map(rows.map(r => [r.task.id, r]))
  const preds = new Map<string, Row[]>()
  const succs = new Map<string, Row[]>()
  for (const r of rows) {
    const p = (r.task.dependencies ?? []).map(id => byId.get(id)).filter((x): x is Row => !!x)
    preds.set(r.task.id, p)
    for (const dep of p) {
      if (!succs.has(dep.task.id)) succs.set(dep.task.id, [])
      succs.get(dep.task.id)!.push(r)
    }
  }

  // Kahn's algorithm for a topological order; bail out (no critical path
  // highlighted) if the dependency graph has a cycle.
  const indeg = new Map(rows.map(r => [r.task.id, (preds.get(r.task.id) ?? []).length]))
  const queue = rows.filter(r => indeg.get(r.task.id) === 0).map(r => r.task.id)
  const order: string[] = []
  const q = [...queue]
  while (q.length) {
    const id = q.shift()!
    order.push(id)
    for (const s of succs.get(id) ?? []) {
      indeg.set(s.task.id, (indeg.get(s.task.id) ?? 0) - 1)
      if (indeg.get(s.task.id) === 0) q.push(s.task.id)
    }
  }
  if (order.length !== rows.length) return new Set()

  const ES = new Map<string, number>()
  const EF = new Map<string, number>()
  for (const id of order) {
    const row = byId.get(id)!
    const p = preds.get(id) ?? []
    const es = p.length ? Math.max(...p.map(d => EF.get(d.task.id)!)) : 0
    ES.set(id, es)
    EF.set(id, es + row.duration)
  }
  const projectEnd = Math.max(...[...EF.values()], 0)

  const LS = new Map<string, number>()
  const LF = new Map<string, number>()
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]
    const row = byId.get(id)!
    const s = succs.get(id) ?? []
    const lf = s.length ? Math.min(...s.map(d => LS.get(d.task.id)!)) : projectEnd
    LF.set(id, lf)
    LS.set(id, lf - row.duration)
  }

  const critical = new Set<string>()
  for (const id of order) {
    if (Math.abs((LS.get(id) ?? 0) - (ES.get(id) ?? 0)) < 0.5) critical.add(id)
  }
  return critical
}

export function GanttChart({ tasks }: { tasks: Task[] }) {
  const [zoom, setZoom] = useState<Zoom>('comfortable')
  const [cursor, setCursor] = useState(0) // horizontal scroll offset in days, via +/- controls
  const [showCritical, setShowCritical] = useState(true)
  const dayWidth = DAY_WIDTHS[zoom]

  // Build rows with a resolved date range, WBS numbering, duration and
  // progress. Tasks missing a start date fall back to a short window ending
  // on the due date so they still render instead of being silently dropped.
  const groups = useMemo(() => {
    const byProject = new Map<string, Task[]>()
    for (const t of tasks) {
      const key = t.projectName || 'Unassigned'
      if (!byProject.has(key)) byProject.set(key, [])
      byProject.get(key)!.push(t)
    }

    const out: { project: string; wbs: string; rows: Row[] }[] = []
    let gi = 0
    for (const [project, projectTasks] of byProject.entries()) {
      gi++
      const rows: Row[] = []
      let ti = 0
      for (const task of projectTasks) {
        const due = toDate(task.dueDate)
        const explicitStart = toDate(task.startDate)
        const start = explicitStart ?? (due ? addDays(due, -3) : null)
        const end = due ?? (start ? addDays(start, 3) : null)
        if (!start || !end) continue
        ti++
        const s = start <= end ? start : end
        const e = start <= end ? end : start
        const isMilestone = !!task.milestone || (!!explicitStart && !!due && explicitStart.getTime() === due.getTime())
        rows.push({
          task,
          start: s,
          end: e,
          duration: isMilestone ? 0 : daySpan(s, e),
          percent: task.percentComplete ?? STATUS_PROGRESS[task.status],
          isMilestone,
          wbs: `${gi}.${ti}`,
        })
      }
      rows.sort((a, b) => a.start.getTime() - b.start.getTime())
      if (rows.length) out.push({ project, wbs: String(gi), rows })
    }
    return out
  }, [tasks])

  const rows = useMemo(() => groups.flatMap(g => g.rows), [groups])
  const critical = useMemo(() => (showCritical ? computeCriticalPath(rows) : new Set<string>()), [rows, showCritical])

  const timelineStart = useMemo(() => {
    const base = rows.length
      ? rows.reduce((min, r) => (r.start < min ? r.start : min), rows[0].start)
      : new Date()
    return addDays(base, -2 + cursor)
  }, [rows, cursor])

  const timelineEnd = useMemo(() => {
    const base = rows.length
      ? rows.reduce((max, r) => (r.end > max ? r.end : max), rows[0].end)
      : addDays(new Date(), 30)
    return addDays(base, 4)
  }, [rows])

  const totalDays = Math.max(14, Math.round((timelineEnd.getTime() - timelineStart.getTime()) / DAY_MS))
  const chartWidth = totalDays * dayWidth

  const days = useMemo(
    () => Array.from({ length: totalDays }, (_, i) => addDays(timelineStart, i)),
    [timelineStart, totalDays]
  )

  // Month header groups (span of consecutive days belonging to one month).
  const months = useMemo(() => {
    const out: { label: string; span: number }[] = []
    for (const d of days) {
      const label = d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
      if (out.length && out[out.length - 1].label === label) out[out.length - 1].span++
      else out.push({ label, span: 1 })
    }
    return out
  }, [days])

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayOffset = Math.round((today.getTime() - timelineStart.getTime()) / DAY_MS)

  const xFor = (d: Date) => Math.round((d.getTime() - timelineStart.getTime()) / DAY_MS) * dayWidth
  const widthFor = (r: Row) => Math.max(dayWidth, (Math.round((r.end.getTime() - r.start.getTime()) / DAY_MS) + 1) * dayWidth)

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-10 text-center text-sm text-slate-400">
        No tasks with a start or due date to plot yet.
      </div>
    )
  }

  const rowIndexById = new Map(rows.map((r, i) => [r.task.id, i]))
  const predecessorLabel = (r: Row) =>
    (r.task.dependencies ?? [])
      .map(id => rows[rowIndexById.get(id) ?? -1]?.wbs)
      .filter(Boolean)
      .join(', ') || '—'

  // Grid (left table) column widths — mirrors MS Project's classic
  // WBS / Task Name / Duration / Start / Finish / % / Predecessors columns.
  const COLS = { wbs: 34, name: 168, dur: 48, start: 56, finish: 56, pct: 40, pred: 56 }
  const labelColWidth = Object.values(COLS).reduce((a, b) => a + b, 0)
  const rowH = 30
  const groupHeaderH = 28
  const headerH = 52

  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(c => c - 7)} className="w-7 h-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setCursor(0)} className="text-xs font-semibold px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
            Today
          </button>
          <button onClick={() => setCursor(c => c + 7)} className="w-7 h-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCritical(v => !v)}
            className={`ml-2 text-xs font-semibold px-2 py-1 rounded-md border ${showCritical ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-950/30 dark:border-red-900' : 'border-slate-200 dark:border-slate-700 text-slate-400'}`}>
            Critical path
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(z => (z === 'wide' ? 'comfortable' : 'compact'))}
            disabled={zoom === 'compact'}
            className="w-7 h-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 disabled:opacity-30">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-400 w-20 text-center capitalize">{zoom}</span>
          <button onClick={() => setZoom(z => (z === 'compact' ? 'comfortable' : 'wide'))}
            disabled={zoom === 'wide'}
            className="w-7 h-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 disabled:opacity-30">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex overflow-x-auto">
        {/* Sticky task grid: WBS / Name / Duration / Start / Finish / % / Predecessors */}
        <div className="flex-shrink-0 sticky left-0 z-10 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700" style={{ width: labelColWidth }}>
          <div className="flex h-[52px] border-b border-slate-200 dark:border-slate-700 items-end text-[10px] font-bold text-slate-400 uppercase tracking-wide">
            <div style={{ width: COLS.wbs }} className="px-1 pb-1">#</div>
            <div style={{ width: COLS.name }} className="px-2 pb-1">Task name</div>
            <div style={{ width: COLS.dur }} className="px-1 pb-1 text-right">Dur.</div>
            <div style={{ width: COLS.start }} className="px-1 pb-1 text-right">Start</div>
            <div style={{ width: COLS.finish }} className="px-1 pb-1 text-right">Finish</div>
            <div style={{ width: COLS.pct }} className="px-1 pb-1 text-right">%</div>
            <div style={{ width: COLS.pred }} className="px-1 pb-1 text-right">Pred.</div>
          </div>
          {groups.map(g => (
            <div key={g.project}>
              <div className="flex items-center bg-slate-50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700" style={{ height: groupHeaderH }}>
                <div style={{ width: COLS.wbs }} className="px-1 text-[11px] font-bold text-slate-500">{g.wbs}</div>
                <div style={{ width: labelColWidth - COLS.wbs }} className="px-2 text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{g.project}</div>
              </div>
              {g.rows.map(r => (
                <div key={r.task.id} className="flex items-center border-b border-slate-50 dark:border-slate-700/50 text-[11px]" style={{ height: rowH }}>
                  <div style={{ width: COLS.wbs }} className="px-1 text-slate-400">{r.wbs}</div>
                  <div style={{ width: COLS.name }} className="px-2 text-slate-700 dark:text-slate-300 truncate flex items-center gap-1">
                    {r.isMilestone && <Diamond className="w-2.5 h-2.5 shrink-0 fill-slate-700 text-slate-700 dark:fill-slate-200 dark:text-slate-200" />}
                    <span className="truncate">{r.task.title}</span>
                  </div>
                  <div style={{ width: COLS.dur }} className="px-1 text-right text-slate-400">{r.isMilestone ? '0d' : `${r.duration}d`}</div>
                  <div style={{ width: COLS.start }} className="px-1 text-right text-slate-400">{fmtShort(r.start)}</div>
                  <div style={{ width: COLS.finish }} className="px-1 text-right text-slate-400">{fmtShort(r.end)}</div>
                  <div style={{ width: COLS.pct }} className="px-1 text-right text-slate-400">{r.percent}%</div>
                  <div style={{ width: COLS.pred }} className="px-1 text-right text-slate-400 truncate">{predecessorLabel(r)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Scrollable timeline */}
        <div className="relative" style={{ width: chartWidth }}>
          {/* Month + day header */}
          <div className="sticky top-0 z-[5] bg-white dark:bg-slate-800">
            <div className="flex h-6 border-b border-slate-100 dark:border-slate-700">
              {months.map((m, i) => (
                <div key={i} className="flex-shrink-0 flex items-center justify-center text-xs font-bold text-slate-500 border-r border-slate-100 dark:border-slate-700 capitalize"
                  style={{ width: m.span * dayWidth }}>
                  {m.label}
                </div>
              ))}
            </div>
            <div className="flex h-[26px] border-b border-slate-200 dark:border-slate-700">
              {days.map((d, i) => (
                <div key={i}
                  className={`flex-shrink-0 flex items-center justify-center text-[10px] border-r border-slate-50 dark:border-slate-700/50 ${isWeekend(d) ? 'bg-slate-50 dark:bg-slate-900/30 text-slate-300' : 'text-slate-400'}`}
                  style={{ width: dayWidth }}>
                  {d.getDate()}
                </div>
              ))}
            </div>
          </div>

          {/* Weekend shading + today line, spanning full height */}
          <div className="absolute inset-0 top-[52px] pointer-events-none">
            {days.map((d, i) => isWeekend(d) && (
              <div key={i} className="absolute top-0 bottom-0 bg-slate-50 dark:bg-slate-900/20" style={{ left: i * dayWidth, width: dayWidth }} />
            ))}
            {todayOffset >= 0 && todayOffset < totalDays && (
              <div className="absolute top-0 bottom-0 w-px bg-red-400 z-[6]" style={{ left: todayOffset * dayWidth }}>
                <div className="absolute -top-0.5 -left-[3px] w-2 h-2 rounded-full bg-red-400" />
              </div>
            )}
          </div>

          {/* Rows + bars */}
          <div className="relative">
            {groups.map(g => {
              const gStart = g.rows.reduce((min, r) => (r.start < min ? r.start : min), g.rows[0].start)
              const gEnd = g.rows.reduce((max, r) => (r.end > max ? r.end : max), g.rows[0].end)
              const barX1 = xFor(gStart)
              const barX2 = xFor(gEnd) + dayWidth
              return (
                <div key={g.project}>
                  {/* Project summary "bracket" bar, MS-Project style */}
                  <div className="relative border-b border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/20" style={{ height: groupHeaderH }}>
                    <svg
                      className="absolute"
                      style={{ left: barX1, top: groupHeaderH / 2 - 6, width: Math.max(dayWidth, barX2 - barX1), height: 12 }}
                      viewBox={`0 0 ${Math.max(dayWidth, barX2 - barX1)} 12`}
                      preserveAspectRatio="none">
                      <rect x="0" y="2" width={Math.max(dayWidth, barX2 - barX1)} height="3" className="fill-slate-700 dark:fill-slate-200" />
                      <polygon points="0,0 8,0 0,12" className="fill-slate-700 dark:fill-slate-200" />
                      <polygon
                        points={`${Math.max(dayWidth, barX2 - barX1)},0 ${Math.max(dayWidth, barX2 - barX1) - 8},0 ${Math.max(dayWidth, barX2 - barX1)},12`}
                        className="fill-slate-700 dark:fill-slate-200" />
                    </svg>
                  </div>
                  {g.rows.map(r => {
                    const overdue = r.task.status !== 'done' && r.end < today && !r.isMilestone
                    const isCritical = critical.has(r.task.id)
                    const barColor = isCritical ? 'bg-red-500' : STATUS_COLOR[r.task.status]
                    return (
                      <div key={r.task.id} className="border-b border-slate-50 dark:border-slate-700/50 relative" style={{ height: rowH }}>
                        {/* Dependency connectors: elbow line with arrowhead from each dependency's end to this bar's start */}
                        {(r.task.dependencies ?? []).map(depId => {
                          const depIdx = rowIndexById.get(depId)
                          if (depIdx === undefined) return null
                          const dep = rows[depIdx]
                          const x1 = xFor(dep.end) + dayWidth
                          const x2 = xFor(r.start)
                          if (x2 <= x1) return null
                          return (
                            <svg key={depId} className="absolute top-1/2 -translate-y-1/2 pointer-events-none overflow-visible" style={{ left: x1, width: x2 - x1, height: 1 }}>
                              <line x1="0" y1="0" x2={x2 - x1 - 5} y2="0" stroke="currentColor" className="text-slate-300 dark:text-slate-600" strokeWidth="1" />
                              <polygon points={`${x2 - x1 - 6},-3 ${x2 - x1},0 ${x2 - x1 - 6},3`} className="fill-slate-300 dark:fill-slate-600" />
                            </svg>
                          )
                        })}
                        {r.isMilestone ? (
                          <div
                            title={`${r.task.title} — ${fmt(r.start)} (milestone)`}
                            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rotate-45 ${isCritical ? 'bg-red-500' : 'bg-slate-700 dark:bg-slate-200'} shadow-sm`}
                            style={{ left: xFor(r.start) + dayWidth / 2 }} />
                        ) : (
                          <div
                            title={`${r.task.title} — ${fmt(r.start)} → ${fmt(r.end)} — ${r.percent}%${isCritical ? ' — critical' : ''}`}
                            className={`absolute top-1.5 h-6 rounded-md ${barColor} ${overdue ? 'ring-2 ring-red-400' : ''} shadow-sm overflow-hidden`}
                            style={{ left: xFor(r.start), width: widthFor(r) }}>
                            {/* Progress fill, like MS Project's darker inner bar showing % complete */}
                            <div className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${r.percent}%` }} />
                            <div className="relative h-full flex items-center px-2">
                              <span className="text-[10px] font-semibold text-white truncate">{r.task.title}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-slate-100 dark:border-slate-700">
        {(Object.entries(STATUS_COLOR) as [TaskStatus, string][]).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
            <span className="text-xs text-slate-500 capitalize">{status.replace('_', ' ')}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
          <span className="text-xs text-slate-500">Critical path</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm ring-2 ring-red-400" />
          <span className="text-xs text-slate-500">Overdue</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rotate-45 bg-slate-700 dark:bg-slate-200" />
          <span className="text-xs text-slate-500">Milestone</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-1.5 bg-slate-700 dark:bg-slate-200" />
          <span className="text-xs text-slate-500">Project summary</span>
        </div>
      </div>
    </div>
  )
}
