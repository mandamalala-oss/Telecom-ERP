import { useEffect, useState } from 'react'
import { Upload, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { parseMSProjectCSV, type MSProjectDateLocale, type MSProjectImportResult } from '@/lib/msProjectImport'
import type { Project, ProjectPhase, Task, User } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  projects: Project[]
  users: User[]
  defaultProjectId?: string
  onConfirm: (tasks: Task[], unresolvedCount: number) => Promise<void>
}

const phases: ProjectPhase[] = ['survey', 'installation', 'integration', 'atp', 'acceptance']

/** Preview-first importer for the standard MS Project CSV export. */
export function MSProjectImportModal({ open, onClose, projects, users, defaultProjectId = '', onConfirm }: Props) {
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [phase, setPhase] = useState<ProjectPhase>('survey')
  const [dateLocale, setDateLocale] = useState<MSProjectDateLocale>('dmy')
  const [result, setResult] = useState<MSProjectImportResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setProjectId(defaultProjectId)
    setPhase('survey')
    setDateLocale('dmy')
    setResult(null)
    setFileName('')
    setError(null)
  }, [open, defaultProjectId])

  const project = projects.find((item) => item.id === projectId)

  const readFile = async (file: File) => {
    setReading(true)
    setError(null)
    setFileName(file.name)
    try {
      const parsed = parseMSProjectCSV(await file.text(), {
        projectId,
        projectName: project?.name ?? '',
        phase,
        dateLocale,
        users,
      })
      setResult(parsed)
    } catch (e: any) {
      setResult(null)
      setError(`Could not read the CSV: ${e?.message ?? String(e)}`)
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
            <li>File → Save As → CSV (Comma delimited) (*.csv)</li>
            <li>Export Wizard → Selected data → Task mapping</li>
            <li>Include ID, Task Name, Start, Finish, % Complete, Predecessors, Resource Names</li>
          </ol>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            Project
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setResult(null) }} className="select normal-case font-normal text-sm">
              <option value="">Select project…</option>
              {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            Phase for imported tasks
            <select value={phase} onChange={(e) => { setPhase(e.target.value as ProjectPhase); setResult(null) }} className="select normal-case font-normal text-sm">
              {phases.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            CSV date format
            <select value={dateLocale} onChange={(e) => { setDateLocale(e.target.value as MSProjectDateLocale); setResult(null) }} className="select normal-case font-normal text-sm">
              <option value="dmy">Day / Month / Year</option>
              <option value="mdy">Month / Day / Year</option>
            </select>
          </label>
        </div>

        <label className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 text-sm font-semibold cursor-pointer transition-colors ${canPreview ? 'border-slate-300 dark:border-slate-600 hover:border-brand-400 text-slate-600 dark:text-slate-300' : 'border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'}`}>
          <Upload className="w-5 h-5" />
          {reading ? 'Reading CSV…' : fileName || 'Choose an MS Project CSV'}
          <input type="file" accept=".csv,text/csv" className="hidden" disabled={!canPreview || reading} onChange={(e) => { const file = e.target.files?.[0]; if (file) void readFile(file) }} />
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
                  {result.tasks.map((task) => <tr key={task.id}>
                    <td className="p-2 font-semibold text-slate-700 dark:text-slate-200">{task.title}</td>
                    <td className="p-2 text-slate-500">{task.startDate || '—'}</td>
                    <td className="p-2 text-slate-500">{task.dueDate || '—'}</td>
                    <td className="p-2"><span className="capitalize">{task.status.replace('_', ' ')}</span>{task.isMilestone && ' · milestone'}</td>
                    <td className={`p-2 ${task.assigneeId ? 'text-slate-500' : 'text-amber-600'}`}>{task.assigneeName || 'Unresolved'}</td>
                    <td className="p-2 text-slate-500">{task.dependencies.length || '—'}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
