import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { buildResultsForTemplate, summarizeResults } from '@/lib/atpChecklist'
import { clsx } from 'clsx'
import type { ATPRecord, ATPTemplate, ATPResult } from '@/types/v2'

interface Props {
  open: boolean
  record: ATPRecord | null
  template: ATPTemplate | null
  onClose: () => void
  onSave: (payload: {
    results: ATPResult[]
    passCount: number
    failCount: number
    naCount: number
    overallResult: ATPRecord['overallResult']
  }) => Promise<void>
}

const RESULT_OPTIONS: ATPResult['result'][] = ['pass', 'fail', 'na', 'pending']
const RESULT_LABEL: Record<ATPResult['result'], string> = { pass: 'Pass', fail: 'Fail', na: 'N/A', pending: 'Pending' }

const OPTION_CLS: Record<ATPResult['result'], string> = {
  pass: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800',
  fail: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  na: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600',
  pending: 'bg-white text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-600',
}

/** Fill an ATP record against its template: one row per test item. */
export function RecordResultsModal({ open, record, template, onClose, onSave }: Props) {
  const [results, setResults] = useState<ATPResult[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Rebuild the rows on open: template items drive the list, saved values are
  // kept by itemId (new items start pending, removed items drop out).
  useEffect(() => {
    if (open) {
      setResults(buildResultsForTemplate(template, record?.results ?? []))
      setError(null)
    }
  }, [open, record, template])

  const setResult = (itemId: string, patch: Partial<ATPResult>) =>
    setResults((rs) => rs.map((r) => (r.itemId === itemId ? { ...r, ...patch } : r)))

  const summary = summarizeResults(results)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave({ results, ...summary })
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title={record ? `Results — ATP ${record.atpNumber}` : 'Results'} size="xl" onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-green-600 font-bold">{summary.passCount} pass</span>
            <span className="text-red-600 font-bold">{summary.failCount} fail</span>
            <span className="text-slate-400 font-bold">{summary.naCount} n/a</span>
            <span className="font-black uppercase text-slate-700 dark:text-slate-200">{summary.overallResult}</span>
          </div>
          <div className="flex items-center gap-2">
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !template}>{saving ? 'Saving…' : 'Save results'}</Button>
          </div>
        </div>
      }>
      {!template ? (
        <p className="text-sm text-slate-500">This record has no template — pick one on the record first.</p>
      ) : (
        <div className="space-y-5">
          {(template.sections ?? []).map((sec) => (
            <div key={sec.id}>
              <p className="text-sm font-bold text-slate-900 dark:text-white mb-2">{sec.title}</p>
              <div className="space-y-2">
                {sec.items.map((item) => {
                  const r = results.find((x) => x.itemId === item.id)
                  if (!r) return null
                  return (
                    <div key={item.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {item.testName}
                            {item.mandatory && <span className="text-red-500" title="Mandatory"> *</span>}
                          </p>
                          {(item.passCriteria || item.expectedResult) && (
                            <p className="text-xs text-slate-500">{item.passCriteria || item.expectedResult}</p>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {RESULT_OPTIONS.map((opt) => (
                            <button key={opt} type="button" onClick={() => setResult(item.id, { result: opt })}
                              className={clsx('text-xs font-bold px-2 py-1 rounded-full border transition-colors',
                                r.result === opt ? OPTION_CLS[opt] : 'bg-transparent text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300')}>
                              {RESULT_LABEL[opt]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        <input aria-label={`${item.testName} actual value`} className="input" placeholder="Actual value"
                          value={r.actualValue} onChange={(e) => setResult(item.id, { actualValue: e.target.value })} />
                        <input aria-label={`${item.testName} notes`} className="input" placeholder="Notes"
                          value={r.notes} onChange={(e) => setResult(item.id, { notes: e.target.value })} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {(template.sections ?? []).length === 0 && (
            <p className="text-sm text-slate-400">This template has no test items yet — edit its checklist first.</p>
          )}
        </div>
      )}
    </Modal>
  )
}
