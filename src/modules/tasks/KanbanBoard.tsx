import { useState } from 'react'
import { Plus, Clock, AlertTriangle, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { useEntity } from '@/lib/hooks/useEntity'
import { TABLES } from '@/lib/api/entityConfigs'
import type { Task, TaskStatus, TaskPriority, Project, User } from '@/types'

const COLUMNS: { id: TaskStatus; label: string; color: string; dot: string }[] = [
  { id: 'backlog',     label: 'Backlog',     color: 'bg-slate-50 dark:bg-slate-800/40',  dot: 'bg-slate-400' },
  { id: 'todo',        label: 'To Do',       color: 'bg-blue-50 dark:bg-blue-900/10',    dot: 'bg-blue-500' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-amber-50 dark:bg-amber-900/10',  dot: 'bg-amber-500' },
  { id: 'review',      label: 'Review',      color: 'bg-purple-50 dark:bg-purple-900/10',dot: 'bg-purple-500' },
  { id: 'done',        label: 'Done',        color: 'bg-green-50 dark:bg-green-900/10',  dot: 'bg-green-500' },
]

const PRIORITY_ICON: Record<TaskPriority, string> = {
  low: '🔵', medium: '🟡', high: '🟠', critical: '🔴',
}

function isOverdue(dueDate: string) {
  if (!dueDate) return false
  // Compare date-only strings lexicographically: parsing 'YYYY-MM-DD' with
  // new Date() uses UTC midnight, which misflags "today" as overdue in
  // positive-offset timezones (e.g. UTC+3).
  const d = new Date()
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return dueDate.slice(0, 10) < todayStr
}

export function KanbanBoard() {
  const { data: tasks, error, openCreate, remove, update, modal } = useEntityCrud<Task>(TABLES.tasks, 'Task')
  const { data: projects } = useEntity<Project>(TABLES.projects)
  const { data: users } = useEntity<User>(TABLES.users)
  const [filterProject, setFilterProject] = useState('all')
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [selected, setSelected] = useState<Task | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const filteredTasks = tasks.filter(t => {
    const matchProject  = filterProject === 'all' || t.projectId === filterProject
    const matchAssignee = filterAssignee === 'all' || t.assigneeId === filterAssignee
    return matchProject && matchAssignee
  })

  const moveTask = async (taskId: string, newStatus: TaskStatus) => {
    try {
      setActionError(null)
      await update(taskId, { status: newStatus } as Partial<Task>)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return
    try {
      setActionError(null)
      await remove(id)
      setSelected(null)
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  const totalHours = filteredTasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0)
  const loggedHours = filteredTasks.reduce((s, t) => s + (t.loggedHours ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-4">
        {COLUMNS.map(col => {
          const count = filteredTasks.filter(t => t.status === col.id).length
          return (
            <div key={col.id} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${col.dot}`} />
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{col.label}</span>
              <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-full font-bold text-slate-700 dark:text-slate-300">{count}</span>
            </div>
          )
        })}
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span>⏱ {loggedHours}h / {totalHours}h</span>
          <div className="w-24 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5">
            <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${totalHours > 0 ? Math.min(100, loggedHours/totalHours*100) : 0}%` }} />
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)} className="select w-56 text-sm">
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="select w-48 text-sm">
          <option value="all">All Assignees</option>
          {users.filter(u => u.role === 'engineer' || u.role === 'pm').map(u =>
            <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <Button variant="secondary" icon={<Plus className="w-4 h-4"/>} onClick={openCreate}>New Task</Button>
      </div>

      {/* Kanban board */}
      <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: '520px' }}>
        {COLUMNS.map(col => {
          const colTasks = filteredTasks.filter(t => t.status === col.id)
          return (
            <div key={col.id} className={`flex-shrink-0 w-72 rounded-xl ${col.color} p-3 flex flex-col gap-2`}>
              {/* Column header */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{col.label}</span>
                  <span className="text-xs bg-white/70 dark:bg-slate-900/50 px-1.5 py-0.5 rounded-full font-bold text-slate-600 dark:text-slate-400">{colTasks.length}</span>
                </div>
                <button onClick={openCreate}
                  className="w-6 h-6 rounded-md hover:bg-white/60 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 transition-all">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Task cards */}
              <div className="space-y-2 flex-1">
                {colTasks.map(task => (
                  <div key={task.id}
                    onClick={() => setSelected(task)}
                    className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm border border-slate-100 dark:border-slate-700 cursor-pointer hover:shadow-md hover:border-brand-200 dark:hover:border-brand-700 transition-all space-y-2">

                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight flex-1">{task.title}</p>
                      <span className="text-sm flex-shrink-0">{PRIORITY_ICON[task.priority]}</span>
                    </div>

                    <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 truncate">{task.projectName}</p>

                    <div className="flex flex-wrap gap-1">
                      {(task.tags ?? []).slice(0,2).map(tag => (
                        <span key={tag} className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-medium">#{tag}</span>
                      ))}
                      <Badge status={task.phase} className="text-xs" />
                    </div>

                    {(task.estimatedHours ?? 0) > 0 && (
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>{task.loggedHours}h / {task.estimatedHours}h</span>
                          <span>{Math.round((task.loggedHours ?? 0)/task.estimatedHours*100)}%</span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1">
                          <div className="bg-brand-400 h-1 rounded-full" style={{ width: `${Math.min(100, (task.loggedHours ?? 0)/task.estimatedHours*100)}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center text-xs font-bold text-brand-600">
                        {(task.assigneeName ?? '?').split(' ').map(w => w[0]).slice(0,2).join('')}
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
                      {COLUMNS.filter(c => c.id !== col.id).map(c => (
                        <button key={c.id}
                          onClick={e => { e.stopPropagation(); moveTask(task.id!, c.id) }}
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

      {/* Task Detail Modal */}
      {selected && (
        <Modal open title={selected.title} onClose={() => setSelected(null)} size="lg"
          footer={<div className="flex justify-end"><Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(selected.id!)}>Delete</Button></div>}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { l: 'Project',   v: selected.projectName },
                { l: 'Phase',     v: selected.phase },
                { l: 'Assignee',  v: selected.assigneeName },
                { l: 'Due Date',  v: selected.dueDate },
                { l: 'Est Hours', v: `${selected.estimatedHours}h` },
                { l: 'Logged',    v: `${selected.loggedHours}h` },
              ].map(item => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 capitalize">{item.v}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge status={selected.status} /><Badge status={selected.priority} />
            </div>
            {selected.description && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">{selected.description}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Move to</p>
              <div className="flex flex-wrap gap-2">
                {COLUMNS.filter(c => c.id !== selected.status).map(c => (
                  <button key={c.id}
                    onClick={() => { moveTask(selected.id!, c.id); setSelected(null) }}
                    className="btn-secondary text-xs px-3 py-1.5">
                    → {c.label}
                  </button>
                ))}
              </div>
            </div>
            {(selected.dependencies ?? []).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Dependencies</p>
                <div className="flex flex-wrap gap-2">
                  {(selected.dependencies ?? []).map(dep => {
                    const depTask = tasks.find(t => t.id === dep)
                    return depTask ? (
                      <span key={dep} className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-medium text-slate-600 dark:text-slate-300">
                        {depTask.title}
                      </span>
                    ) : null
                  })}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {modal}
    </div>
  )
}
