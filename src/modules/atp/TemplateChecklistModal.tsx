import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ATP_CATEGORIES, newCheckItem, newSection } from '@/lib/atpChecklist'
import type { ATPTemplate, ATPSection, ATPCheckItem } from '@/types/v2'

interface Props {
  open: boolean
  template: ATPTemplate | null
  onClose: () => void
  onSave: (sections: ATPSection[]) => Promise<void>
}

/** Editor for a template's checklist: ordered sections, each with test items. */
export function TemplateChecklistModal({ open, template, onClose, onSave }: Props) {
  const [sections, setSections] = useState<ATPSection[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed from the template each time the modal opens.
  useEffect(() => {
    if (open) {
      setSections((template?.sections ?? []).map((s) => ({ ...s, items: (s.items ?? []).map((i) => ({ ...i })) })))
      setError(null)
    }
  }, [open, template])

  const patchSection = (si: number, patch: Partial<ATPSection>) =>
    setSections((ss) => ss.map((s, i) => (i === si ? { ...s, ...patch } : s)))
  const patchItem = (si: number, ii: number, patch: Partial<ATPCheckItem>) =>
    setSections((ss) => ss.map((s, i) => (i === si ? { ...s, items: s.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) } : s)))
  const addSection = () => setSections((ss) => [...ss, newSection(ss.length + 1)])
  const removeSection = (si: number) => setSections((ss) => ss.filter((_, i) => i !== si))
  const moveSection = (si: number, dir: -1 | 1) =>
    setSections((ss) => {
      const t = si + dir
      if (t < 0 || t >= ss.length) return ss
      const copy = [...ss]
      ;[copy[si], copy[t]] = [copy[t], copy[si]]
      return copy
    })
  const addItem = (si: number) =>
    setSections((ss) => ss.map((s, i) => (i === si ? { ...s, items: [...s.items, newCheckItem()] } : s)))
  const removeItem = (si: number, ii: number) =>
    setSections((ss) => ss.map((s, i) => (i === si ? { ...s, items: s.items.filter((_, j) => j !== ii) } : s)))
  const moveItem = (si: number, ii: number, dir: -1 | 1) =>
    setSections((ss) => ss.map((s, i) => {
      if (i !== si) return s
      const t = ii + dir
      if (t < 0 || t >= s.items.length) return s
      const items = [...s.items]
      ;[items[ii], items[t]] = [items[t], items[ii]]
      return { ...s, items }
    }))

  const handleSave = async () => {
    if (sections.some((s) => !s.title.trim())) { setError('Every section needs a title.'); return }
    if (sections.some((s) => s.items.some((i) => !i.testName.trim()))) { setError('Every test item needs a name.'); return }
    setSaving(true)
    setError(null)
    try {
      // `order` always mirrors the on-screen position.
      await onSave(sections.map((s, i) => ({ ...s, order: i + 1 })))
    } catch (e: any) {
      setError(e.message ?? String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title={template ? `Checklist — ${template.name}` : 'Checklist'} size="xl" onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          {error ? <p className="text-xs text-red-500 flex-1">{error}</p> : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save checklist'}</Button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        {sections.map((sec, si) => (
          <div key={sec.id} className="rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-700/40 rounded-t-xl">
              <span className="w-6 h-6 rounded bg-brand-100 dark:bg-brand-900/30 text-brand-600 text-xs flex items-center justify-center font-black flex-shrink-0">{si + 1}</span>
              <input aria-label={`Section ${si + 1} title`} className="input flex-1" placeholder="Section title (e.g. RF Tests)"
                value={sec.title} onChange={(e) => patchSection(si, { title: e.target.value })} />
              <button type="button" aria-label="Move section up" onClick={() => moveSection(si, -1)} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500"><ChevronUp className="w-4 h-4" /></button>
              <button type="button" aria-label="Move section down" onClick={() => moveSection(si, 1)} className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500"><ChevronDown className="w-4 h-4" /></button>
              <button type="button" aria-label="Remove section" onClick={() => removeSection(si)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {sec.items.map((it, ii) => (
                <div key={it.id} className="p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input aria-label={`Test ${ii + 1} name`} className="input" placeholder="Test name (e.g. VSWR)"
                      value={it.testName} onChange={(e) => patchItem(si, ii, { testName: e.target.value })} />
                    <select aria-label={`Test ${ii + 1} category`} className="input" value={it.category}
                      onChange={(e) => patchItem(si, ii, { category: e.target.value as ATPCheckItem['category'] })}>
                      {ATP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input aria-label={`Test ${ii + 1} expected`} className="input" placeholder="Expected result"
                      value={it.expectedResult} onChange={(e) => patchItem(si, ii, { expectedResult: e.target.value })} />
                    <input aria-label={`Test ${ii + 1} criteria`} className="input" placeholder="Pass criteria"
                      value={it.passCriteria} onChange={(e) => patchItem(si, ii, { passCriteria: e.target.value })} />
                    <input aria-label={`Test ${ii + 1} procedure`} className="input sm:col-span-2" placeholder="Test procedure"
                      value={it.testProcedure} onChange={(e) => patchItem(si, ii, { testProcedure: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <input type="checkbox" checked={it.mandatory} onChange={(e) => patchItem(si, ii, { mandatory: e.target.checked })} />
                      Mandatory
                    </label>
                    <div className="ml-auto flex gap-1">
                      <button type="button" aria-label="Move test up" onClick={() => moveItem(si, ii, -1)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <button type="button" aria-label="Move test down" onClick={() => moveItem(si, ii, 1)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"><ChevronDown className="w-3.5 h-3.5" /></button>
                      <button type="button" aria-label="Remove test" onClick={() => removeItem(si, ii)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
              <div className="p-3">
                <Button type="button" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => addItem(si)}>Add test item</Button>
              </div>
            </div>
          </div>
        ))}
        {sections.length === 0 && <p className="text-sm text-slate-400">No sections yet — add one to start the checklist.</p>}
        <Button type="button" variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={addSection}>Add section</Button>
      </div>
    </Modal>
  )
}
