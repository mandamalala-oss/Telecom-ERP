import type { ATPTemplate, ATPResult, ATPCheckItem, ATPSection } from '@/types/v2'

// ATP checklist helpers: build the template checklist (sections + test items)
// and the per-record results, and roll the results up into pass/fail counts.
// Pure so the editing + scoring rules are unit-testable without a DOM/DB.

export const ATP_CATEGORIES: ATPCheckItem['category'][] = ['rf', 'transmission', 'power', 'alarm', 'software', 'civil', 'safety']

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `atp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** A blank test item for the template editor. */
export function newCheckItem(): ATPCheckItem {
  return { id: uid(), testName: '', testProcedure: '', expectedResult: '', passCriteria: '', mandatory: false, category: 'rf' }
}

/** A blank section for the template editor. */
export function newSection(order: number): ATPSection {
  return { id: uid(), title: '', order, items: [] }
}

/** A pending result row for one template item. */
export function emptyResultFor(itemId: string): ATPResult {
  return { itemId, result: 'pending', actualValue: '', notes: '' }
}

/** Every test item of a template, in section order. */
export function templateItems(template: ATPTemplate | null | undefined): ATPCheckItem[] {
  return (template?.sections ?? []).flatMap((s) => s.items ?? [])
}

/**
 * Results to edit for a record: one row per template item, keeping any value
 * already saved (matched by itemId). Items added to the template since the
 * record was created appear as pending; removed items drop out.
 */
export function buildResultsForTemplate(
  template: ATPTemplate | null | undefined,
  existing: ATPResult[] = [],
): ATPResult[] {
  if (!template) return []
  const byItem = new Map(existing.map((r) => [r.itemId, r]))
  return templateItems(template).map((item) => byItem.get(item.id) ?? emptyResultFor(item.id))
}

export interface ResultSummary {
  passCount: number
  failCount: number
  naCount: number
  overallResult: 'pass' | 'fail' | 'partial'
}

/**
 * Roll results up. `fail` when nothing passed, `partial` when there is a mix
 * (or nothing has been recorded yet), `pass` only when every recorded result
 * passed with no failures.
 */
export function summarizeResults(results: ATPResult[]): ResultSummary {
  let passCount = 0
  let failCount = 0
  let naCount = 0
  for (const r of results) {
    if (r.result === 'pass') passCount++
    else if (r.result === 'fail') failCount++
    else if (r.result === 'na') naCount++
  }
  const overallResult = failCount > 0
    ? (passCount > 0 ? 'partial' : 'fail')
    : (passCount > 0 ? 'pass' : 'partial')
  return { passCount, failCount, naCount, overallResult }
}
