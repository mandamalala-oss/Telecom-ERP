import { useMemo, useRef, useState } from 'react'
import { Plus, AlertTriangle, Clock, Trash2, Pencil, FileUp } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useEntityCrud } from '@/lib/hooks/useEntityCrud'
import { useEntity } from '@/lib/hooks/useEntity'
import { makeApi } from '@/lib/api/crud'
import { useAuth } from '@/contexts/AuthContext'
import { FIELD_CONFIGS, TABLES } from '@/lib/api/entityConfigs'
import { dependencyCycleMessage, findDependencyCycles, findMissingDependencies, resolveTaskDates, buildTaskHierarchy, computeTaskRollups } from '@/lib/taskTimeline'
import { KanbanBoard, COLUMNS, isOverdue } from './KanbanBoard'
import { GanttView } from './GanttView'
import { MSProjectImportModal } from './MSProjectImportModal'
import type { Task, TaskStatus, Project, User, Site, ProjectSite } from '@/types'

type Tab = 'kanban' | 'gantt'

const fmtMoney = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M Ar` : `${n.toLocaleString()} Ar`)

const SCHEDULE_FILTERS = [
  { value: 'all', label: 'All schedules' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'unscheduled', label: 'Unscheduled' },
  { value: 'overdue', label: 'Overdue' },
]

/**
 * Task Board: one page, two tabs. Kanban (the classic board) and Gantt (the
 * project timeline). Both share the same data, filters, permissions and the
 * task detail/edit/delete modal — switching tabs never refetches.
 */
export function TaskBoard() {
  const { canEdit } = useAuth()
  const { data: projects, refresh: refreshProjects } = useEntity<Project>(TABLES.projects)
  const { data: users } = useEntity<User>(TABLES.users)
  const { data: sites } = useEntity<Site>(TABLES.sites)
  const { data: projectSites } = useEntity<ProjectSite>(TABLES.projectSites)

  const taskRowsRef = useRef<Task[]>([])
  const taskValidation = (values: Record<string, any>, editing: Task | null) => {
    const candidate = { ...(editing ?? {}), ...values, id: editing?.id ?? '__new-task__' } as Task
    return dependencyCycleMessage(taskRowsRef.current, candidate, editing?.id)
  }
  const { data: tasks, error, openCreate, openEdit, create, remove, update, modal, editable, refresh: refreshTasks } = useEntityCrud<Task>(
    TABLES.tasks,
    'Task',
    FIELD_CONFIGS[TABLES.tasks],
    undefined,
    undefined,
    undefined,
    { project_sites: projectSites },
    taskValidation
  )
  taskRowsRef.current = tasks

  // Sites linked to each project (project_sites junction) — used to scope the
  // site filter and the task form's site dropdown.
  const sitesByProject = useMemo(() => {
    const siteById = new Map(sites.map((s) => [s.id, s]))
    const map = new Map<string, Site[]>()
    for (const ps of projectSites) {
      const site = siteById.get(ps.siteId)
      if (!site) continue
      const list = map.get(ps.projectId) ?? []
      list.push(site)
      map.set(ps.projectId, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.siteId.localeCompare(b.siteId))
    return map
  }, [projectSites, sites])

  const [tab, setTab] = useState<Tab>('kanban')
  const [filterProject, setFilterProject] = useState('all')
  const [filterSite, setFilterSite] = useState('all')
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPhase, setFilterPhase] = useState('all')
  const [filterSchedule, setFilterSchedule] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Task | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [missingDependenciesDismissed, setMissingDependenciesDismissed] = useState(false)

  const missingDependencies = useMemo(() => findMissingDependencies(tasks), [tasks])
  const hierarchy = useMemo(() => buildTaskHierarchy(tasks), [tasks])
  const rollups = useMemo(() => computeTaskRollups(tasks), [tasks])

  // Site filter options: scoped to the selected project, or all sites.
  const filterSiteOptions = useMemo(() => {
    const list = filterProject === 'all' ? sites : (sitesByProject.get(filterProject) ?? [])
    return [...list].sort((a, b) => a.siteId.localeCompare(b.siteId))
  }, [filterProject, sites, sitesByProject])

  const filteredTasks = useMemo(() => tasks.filter((t) => {
    if (filterProject !== 'all' && t.projectId !== filterProject) return false
    if (filterSite !== 'all' && t.siteId !== filterSite) return false
    if (filterAssignee !== 'all' && t.assigneeId !== filterAssignee) return false
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (filterPhase !== 'all' && t.phase !== filterPhase) return false
    const q = search.trim().toLowerCase()
    if (q && !`${t.title} ${t.projectName} ${t.assigneeName ?? ''}`.toLowerCase().includes(q)) return false
    if (tab === 'gantt' && filterSchedule !== 'all') {
      const r = resolveTaskDates(t)
      if (filterSchedule === 'scheduled' && r.startDay == null) return false
      if (filterSchedule === 'unscheduled' && r.startDay != null) return false
      if (filterSchedule === 'overdue' && !r.overdue) return false
    }
    return true
  }), [tasks, filterProject, filterSite, filterAssignee, filterStatus, filterPhase, filterSchedule, search, tab])

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

  // Delete a whole project (and, via the projects FK cascade, every task in
  // it) — the Gantt "delete the project, not one task at a time" action.
  const deleteProject = async (projectId: string) => {
    if (!canEdit('projects')) {
      setActionError('You do not have permission to delete projects.')
      return
    }
    const project = projects.find((p) => p.id === projectId)
    const taskCount = tasks.filter((t) => t.projectId === projectId).length
    if (!confirm(`Delete project "${project?.name ?? ''}" and all ${taskCount} of its tasks? This cannot be undone.`)) return
    try {
      setActionError(null)
      await makeApi<Project>(TABLES.projects).remove(projectId)
      await refreshTasks()
      await refreshProjects()
    } catch (e: any) {
      setActionError(e.message ?? String(e))
    }
  }

  const importTasks = async (imported: Task[], unresolvedCount: number) => {
    if (!editable) throw new Error('You do not have permission to import tasks.')
    const importCycles = findDependencyCycles([...tasks, ...imported])
    if (importCycles.length > 0) throw new Error('Cannot import tasks: the batch contains a dependency cycle.')
    let importedCount = 0
    for (const task of imported) {
      const payload: Partial<Task> = { ...task }
      // Blank UUID/date values are display placeholders from the parser, not
      // valid PostgreSQL values. Let nullable columns/defaults apply instead.
      delete payload.createdAt
      if (!payload.startDate) delete payload.startDate
      if (!payload.dueDate) delete payload.dueDate
      if (!payload.assigneeId) delete payload.assigneeId
      if (!payload.parentId) delete payload.parentId
      await create(payload)
      importedCount++
    }
    setImportMessage(`${importedCount} task${importedCount === 1 ? '' : 's'} imported, ${unresolvedCount} unresolved reference${unresolvedCount === 1 ? '' : 's'}.`)
  }

  const totalHours = filteredTasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0)
  const loggedHours = filteredTasks.reduce((s, t) => s + (t.loggedHours ?? 0), 0)
  const parentTask = selected?.parentId ? tasks.find((t) => t.id === selected.parentId) : undefined
  const subtaskList = selected
    ? (hierarchy.children.get(selected.id!) ?? []).map((id) => tasks.find((t) => t.id === id)).filter((t): t is Task => !!t)
    : []
  const selectedRollup = selected ? rollups.get(selected.id!) : undefined
  const isParentTask = selectedRollup?.isParent ?? false
  const displayStatus = selected ? (selectedRollup?.status ?? selected.status) : undefined
  const displayCost = selected ? (selectedRollup?.cost ?? selected.cost ?? 0) : 0
  const displayResources = selected
    ? isParentTask ? (selectedRollup?.resources ?? []) : (selected.assigneeName ? [selected.assigneeName] : [])
    : []

  return (
    <div className="space-y-4">
      {/* Tabs + actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg" role="tablist" aria-label="Task board view">
          {(['kanban', 'gantt'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded capitalize transition-all whitespace-nowrap ${
                tab === t ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {tab === 'gantt' && (
            <select value={filterSchedule} onChange={(e) => setFilterSchedule(e.target.value)} className="select w-40 text-sm">
              {SCHEDULE_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
          {editable && <>
            <Button variant="secondary" icon={<FileUp className="w-4 h-4" />} onClick={() => { setImportMessage(null); setImportOpen(true) }}>Import from MS Project</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={openCreate}>New Task</Button>
          </>}
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex flex-wrap gap-4">
        {COLUMNS.map((col) => {
          const count = filteredTasks.filter((t) => t.status === col.id).length
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
            <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${totalHours > 0 ? Math.min(100, loggedHours / totalHours * 100) : 0}%` }} />
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{error}</div>}
      {actionError && <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{actionError}</div>}
      {importMessage && <div className="text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">{importMessage}</div>}
      {tab === 'gantt' && !missingDependenciesDismissed && missingDependencies.size > 0 && (
        <div className="flex items-start justify-between gap-3 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <div>
            <p className="font-semibold">Some task dependencies are unresolved.</p>
            <p className="text-xs mt-1">{[...missingDependencies.entries()].map(([id, deps]) => {
              const task = tasks.find((item) => item.id === id)
              return `${task?.title ?? id}: ${deps.join(', ')}`
            }).join(' · ')}</p>
          </div>
          <button className="text-xs font-semibold hover:underline flex-shrink-0" onClick={() => setMissingDependenciesDismissed(true)}>Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          aria-label="Search tasks"
          className="input w-52 text-sm"
        />
        <select value={filterProject} onChange={(e) => { setFilterProject(e.target.value); setFilterSite('all') }} className="select w-56 text-sm">
          <option value="all">All Projects</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterSite} onChange={(e) => setFilterSite(e.target.value)} className="select w-56 text-sm">
          <option value="all">All Sites</option>
          {filterSiteOptions.map((s) => <option key={s.id} value={s.id}>{s.siteId} — {s.name}</option>)}
        </select>
        <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="select w-48 text-sm">
          <option value="all">All Assignees</option>
          {users.filter((u) => u.role === 'Team Leader' || u.role === 'Inspector' || u.role === 'Manager').map((u) =>
            <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="select w-40 text-sm">
          <option value="all">All Statuses</option>
          {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={filterPhase} onChange={(e) => setFilterPhase(e.target.value)} className="select w-44 text-sm">
          <option value="all">All Phases</option>
          {(['survey', 'installation', 'integration', 'atp', 'acceptance'] as const).map((p) =>
            <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
        </select>
      </div>

      {tab === 'kanban' ? (
        <KanbanBoard tasks={filteredTasks} onSelect={setSelected} onMove={moveTask} openCreate={openCreate} editable={editable} rollups={rollups} />
      ) : (
        <GanttView tasks={filteredTasks} onSelect={setSelected} onEdit={openEdit} editable={editable} rollups={rollups} onDeleteProject={deleteProject} sites={sites} />
      )}

      {/* Task Detail Modal — shared by both tabs */}
      {selected && (
        <Modal open title={selected.title} onClose={() => setSelected(null)} size="lg"
          footer={
            <div className="flex items-center justify-between w-full gap-3">
              {editable ? (
                <Button variant="secondary" icon={<Pencil className="w-4 h-4" />}
                  onClick={() => { openEdit(selected); setSelected(null) }}>
                  Edit
                </Button>
              ) : <span />}
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => handleDelete(selected.id!)}>Delete</Button>
            </div>
          }>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { l: 'Project',   v: selected.projectName },
                ...(parentTask ? [{ l: 'Parent', v: parentTask.title }] : []),
                { l: 'Phase',     v: selected.phase },
                { l: 'Assignee',  v: displayResources.join(', ') || '—' },
                { l: 'Cost',      v: fmtMoney(displayCost) },
                { l: 'Start',     v: selected.startDate || '—' },
                { l: 'Due Date',  v: selected.dueDate },
                { l: 'Est Hours', v: `${selected.estimatedHours}h` },
                { l: 'Logged',    v: `${selected.loggedHours}h` },
              ].map((item) => (
                <div key={item.l} className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{item.l}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 capitalize">{item.v}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <Badge status={displayStatus ?? 'todo'} />
              {isParentTask && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded uppercase">Summary · auto</span>}
              <Badge status={selected.priority} />
            </div>
            {selected.description && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">{selected.description}</p>
              </div>
            )}
            {subtaskList.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Subtasks</p>
                <div className="flex flex-wrap gap-2">
                  {subtaskList.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={() => setSelected(sub)}
                      className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                    >
                      {sub.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!isParentTask && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Move to</p>
                <div className="flex flex-wrap gap-2">
                  {COLUMNS.filter((c) => c.id !== selected.status).map((c) => (
                    <button key={c.id}
                      onClick={() => { moveTask(selected.id!, c.id); setSelected(null) }}
                      className="btn-secondary text-xs px-3 py-1.5">
                      → {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(selected.dependencies ?? []).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Dependencies</p>
                <div className="flex flex-wrap gap-2">
                  {(selected.dependencies ?? []).map((dep) => {
                    const depTask = tasks.find((t) => t.id === dep)
                    return depTask ? (
                      <span key={dep} className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded font-medium text-slate-600 dark:text-slate-300">
                        {depTask.title}
                      </span>
                    ) : (
                      <span key={dep} className="text-xs bg-red-50 dark:bg-red-900/30 text-red-500 px-2 py-1 rounded font-medium">
                        Missing task {dep}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {modal}
      <MSProjectImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        projects={projects}
        sites={sites}
        projectSites={projectSites}
        users={users}
        defaultProjectId={filterProject === 'all' ? '' : filterProject}
        onConfirm={importTasks}
      />
    </div>
  )
}
