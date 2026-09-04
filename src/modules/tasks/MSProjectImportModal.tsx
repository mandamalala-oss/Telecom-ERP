import { useEffect, useMemo, useState } from 'react'
import { Upload, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { parseMSProjectXML, type MSProjectImportResult, type TaskAssignmentInfo } from '@/lib/msProjectImport'
import { buildTaskHierarchy } from '@/lib/taskTimeline'
import type { Project, ProjectPhase, Task, User, Site, ProjectSite } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  projects: Project[]
  sites: Site[]
  projectSites: ProjectSite[]
  users: User[]
  defaultProjectId?: string
  onConfirm: (tasks: Task[], unresolvedCount: number) => Promise<void>
}

const phases: ProjectPhase[] = ['survey', 'installation', 'integration', 'atp', 'acceptance']

/** Human-readable assignee cell: distinguishes a matched user, an unmatched
 * person, equipment/material/cost resources, and no assignment at all. */
function renderAssignee(task: Task, info?: TaskAssignmentInfo) {
  if (info?.matchedName) return <span className="text-slate-500">{info.matchedName}</span>
  if (info && info.personNames.length > 0) return <span className="text-amber-600">Not matched: {info.personNames[0]}</span>
  if (info && info.materialNames.length > 0) return <span className="text-slate-400">Equipment: {info.materialNames.join(', ')}</span>
  return <span className="text-slate-400">No person assigned</span>
}

/** Preview-first importer for the standard MS Project XML file format. */
export function MSProjectImportModal({ open, onClose, projects, sites, projectSites, users, defaultProjectId = '', onConfirm }: Props) {
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [siteId, setSiteId] = useState('')
  const [phase, setPhase] = useState<ProjectPhase>('survey')
  const [result, setResult] = useState<MSProjectImportResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setProjectId(defaultProjectId)
    setSiteId('')
    setPhase('survey')
    setResult(null)
    setFileName('')
    setError(null)
  }, [open, defaultProjectId])

  const project = projects.find((item) => item.id === projectId)

  // Sites linked to the selected project (project_sites junction).
  const sitesForProject = useMemo(() => {
    const siteById = new Map(sites.map((s) => [s.id, s]))
    const siteIds = new Set(projectSites.filter((ps) => ps.projectId === projectId).map((ps) => ps.siteId))
    return [...siteIds].map((id) => siteById.get(id)).filter((s): s is Site => !!s).sort((a, b) => a.siteId.localeCompare(b.siteId))
  }, [sites, projectSites, projectId])

  const hierarchy = useMemo(() => (result ? buildTaskHierarchy(result.tasks) : null), [result])
  const assignmentById = useMemo(() => new Map((result?.assignments ?? []).map((a) => [a.taskId, a])), [result])

  const readFile = async (file: File) => {
    setReading(true)
    setError(null)
    setFileName(file.name)
    try {
      const parsed = parseMSProjectXML(await file.text(), {
        projectId,
        projectName: project?.name ?? '',
        phase,
        dateLocale: 'dmy',
        users,
        siteId,
      })
      setResult(parsed)
    } catch (e: any) {
      setResult(null)
      setError(`Could not read the XML: ${e?.message ?? String(e)}`)
    } finally {
      setReading(false)
    }
  }

  const confirmImport = async () => {
    if (!result || result.tasks.length === 0) return
    setSaving(true)
    setError(null)
    try {
      await onConfirm(result.tasks, result.unresolvedDependencies.length + result.unresolvedAssignees.length)
      onClose()
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  const canPreview = !!projectId && !!project
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import from MS Project"
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          {error ? <p className="text-xs text-red-500 flex-1">{error}</p> : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => void confirmImport()} disabled={!result || result.tasks.length === 0 || saving} loading={saving}>
              Import {result?.tasks.length ?? 0} tasks
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-200">
          <p className="font-bold mb-1">Export from MS Project</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>In MS Project: File → Save As → XML Format (*.xml)</li>
            <li>Choose the saved file below (French or English project files both work)</li>
            <li>Tasks and subtasks keep their parent/child structure; predecessors become dependencies</li>
          </ol>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            Project
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setSiteId(''); setResult(null) }} className="select normal-case font-normal text-sm">
              <option value="">Select project…</option>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            Site
            <select value={siteId} onChange={(e) => { setSiteId(e.target.value); setResult(null) }} className="select normal-case font-normal text-sm" disabled={!projectId}>
              <option value="">Select site…</option>
              {sitesForProject.map((item) => <option key={item.id} value={item.id}>{item.siteId} — {item.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            Phase for imported tasks
            <select value={phase} onChange={(e) => { setPhase(e.target.value as ProjectPhase); setResult(null) }} className="select normal-case font-normal text-sm">
              {phases.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <label className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 text-sm font-semibold cursor-pointer transition-colors ${canPreview ? 'border-slate-300 dark:border-slate-600 hover:border-brand-400 text-slate-600 dark:text-slate-300' : 'border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'}`}>
          <Upload className="w-5 h-5" />
          {reading ? 'Reading XML…' : fileName || 'Choose an MS Project XML file'}
          <input type="file" accept=".xml,text/xml,application/xml" className="hidden" disabled={!canPreview || reading} onChange={(e) => { const file = e.target.files?.[0]; if (file) void readFile(file) }} />
        </label>
        {!canPreview && <p className="text-xs text-amber-600">Select a project before choosing the file.</p>}

        {result && (
          <div className="space-y-3">
            {result.errors.length > 0 && <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">{result.errors.join(' · ')}</div>}
            {(result.unresolvedDependencies.length > 0 || result.unresolvedAssignees.length > 0) && (
              <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Unresolved references will not block import.</p>
                  {result.unresolvedDependencies.length > 0 && <p>Dependencies: {result.unresolvedDependencies.map((item) => `${item.taskName} → ${item.predecessorId}`).join(' · ')}</p>}
                  {result.unresolvedAssignees.length > 0 && <p>Assignees: {result.unresolvedAssignees.map((item) => `${item.taskName} → ${item.resourceName}`).join(' · ')}</p>}
                </div>
              </div>
            )}
            <div className="overflow-auto max-h-72 rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-left text-slate-500 uppercase tracking-wide">
                  <tr><th className="p-2">Task Name</th><th className="p-2">Start</th><th className="p-2">Finish</th><th className="p-2">Status</th><th className="p-2">Assignee</th><th className="p-2">Predecessors</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {result.tasks.map((task) => {
                    const depth = hierarchy?.depth.get(task.id) ?? 0
                    const hasChildren = (hierarchy?.children.get(task.id) ?? []).length > 0
                    const info = assignmentById.get(task.id)
                    return <tr key={task.id}>
                      <td className="p-2" style={{ paddingLeft: 8 + depth * 16 }}>
                        <span className={hasChildren ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-200'}>
                          {task.title}
                        </span>
                      </td>
                      <td className="p-2 text-slate-500">{task.startDate || '—'}</td>
                      <td className="p-2 text-slate-500">{task.dueDate || '—'}</td>
                      <td className="p-2"><span className="capitalize">{task.status.replace('_', ' ')}</span>{task.isMilestone && ' · milestone'}</td>
                      <td className="p-2">{renderAssignee(task, info)}</td>
                      <td className="p-2 text-slate-500">{task.dependencies.length || '—'}</td>
                    </tr>
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
