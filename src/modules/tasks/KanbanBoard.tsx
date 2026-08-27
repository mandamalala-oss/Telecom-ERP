import { Plus, Clock, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { Task, TaskStatus, TaskPriority } from '@/types'

export const COLUMNS: { id: TaskStatus; label: string; color: string; dot: string }[] = [
  { id: 'backlog',     label: 'Backlog',     color: 'bg-slate-50 dark:bg-slate-800/40',  dot: 'bg-slate-400' },
  { id: 'todo',        label: 'To Do',       color: 'bg-blue-50 dark:bg-blue-900/10',    dot: 'bg-blue-500' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-amber-50 dark:bg-amber-900/10',  dot: 'bg-amber-500' },
  { id: 'review',      label: 'Review',      color: 'bg-purple-50 dark:bg-purple-900/10',dot: 'bg-purple-500' },
  { id: 'done',        label: 'Done',        color: 'bg-green-50 dark:bg-green-900/10',  dot: 'bg-green-500' },
]

const PRIORITY_ICON: Record<TaskPriority, string> = {
  low: '🔵', medium: '🟡', high: '🟠', critical: '🔴',
}

export function isOverdue(dueDate: string) {
  if (!dueDate) return false
  // Compare date-only strings lexicographically: parsing 'YYYY-MM-DD' with
  // new Date() uses UTC midnight, which misflags "today" as overdue in
  // positive-offset timezones (e.g. UTC+3).
  const d = new Date()
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return dueDate.slice(0, 10) < todayStr
}

interface KanbanBoardProps {
  tasks: Task[]
  onSelect: (task: Task) => void
  onMove: (taskId: string, newStatus: TaskStatus) => void
  openCreate: () => void
  editable: boolean
}

/**
 * Kanban tab of the Task Board. Presentational: data, filters, detail modal
 * and CRUD all live in TaskBoard — this component only lays out the columns
 * and cards, so the Gantt tab and this tab always share the same task set.
 */
export function KanbanBoard({ tasks, onSelect, onMove, openCreate, editable }: KanbanBoardProps) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: '520px' }}>
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id)
        return (
          <div key={col.id} className={`flex-shrink-0 w-72 rounded-xl ${col.color} p-3 flex flex-col gap-2`}>
            {/* Column header */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{col.label}</span>
                <span className="text-xs bg-white/70 dark:bg-slate-900/50 px-1.5 py-0.5 rounded-full font-bold text-slate-600 dark:text-slate-400">{colTasks.length}</span>
              </div>
              {editable && (
                <button onClick={openCreate}
                  className="w-6 h-6 rounded-md hover:bg-white/60 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 transition-all">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Task cards */}
            <div className="space-y-2 flex-1">
              {colTasks.map((task) => (
                <div key={task.id}
                  onClick={() => onSelect(task)}
                  className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm border border-slate-100 dark:border-slate-700 cursor-pointer hover:shadow-md hover:border-brand-200 dark:hover:border-brand-700 transition-all space-y-2">

                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight flex-1">{task.title}</p>
                    <span className="text-sm flex-shrink-0">{PRIORITY_ICON[task.priority]}</span>
                  </div>

                  <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 truncate">{task.projectName}</p>

                  <div className="flex flex-wrap gap-1">
                    {(task.tags ?? []).slice(0, 2).map((tag) => (
                      <span key={tag} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-medium">#{tag}</span>
                    ))}
                    <Badge status={task.phase} className="text-xs" />
                  </div>

                  {(task.estimatedHours ?? 0) > 0 && (
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>{task.loggedHours}h / {task.estimatedHours}h</span>
                        <span>{Math.round((task.loggedHours ?? 0) / task.estimatedHours * 100)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1">
                        <div className="bg-brand-400 h-1 rounded-full" style={{ width: `${Math.min(100, (task.loggedHours ?? 0) / task.estimatedHours * 100)}%` }} />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-xs font-bold text-brand-600">
                      {(task.assigneeName ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}
                    </div>
                    <div className={`flex items-center gap-1 text-xs ${task.dueDate && isOverdue(task.dueDate) && task.status !== 'done' ? 'text-red-500' : 'text-slate-400'}`}>
                      {task.dueDate && isOverdue(task.dueDate) && task.status !== 'done' && <AlertTriangle className="w-3 h-3" />}
                      <Clock className="w-3 h-3" />
                      {task.dueDate}
                    </div>
                  </div>

                  {/* Quick move buttons — every other column is reachable,
                      including `done` (the old .slice(0, 3) made it impossible). */}
                  <div className="flex gap-1 pt-1 border-t border-slate-100 dark:border-slate-700">
                    {COLUMNS.filter((c) => c.id !== col.id).map((c) => (
                      <button key={c.id}
                        onClick={(e) => { e.stopPropagation(); onMove(task.id!, c.id) }}
                        className={`flex-1 min-w-0 text-[10px] py-0.5 rounded font-semibold transition-colors truncate ${c.color} hover:opacity-80 text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700`}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
