import { describe, it, expect } from 'vitest'
import { newCheckItem, newSection, emptyResultFor, templateItems, buildResultsForTemplate, summarizeResults } from './atpChecklist'
import type { ATPTemplate, ATPResult } from '@/types/v2'

const template: ATPTemplate = {
  id: 't1',
  name: 'Nokia 4G RAN ATP',
  version: 'v1',
  customer: 'Telma',
  technologies: ['4G'],
  isActive: true,
  createdAt: '2026-01-01',
  sections: [
    { id: 'sec1', title: 'RF', order: 1, items: [
      { id: 'i1', testName: 'VSWR', testProcedure: 'measure', expectedResult: '<1.5', passCriteria: '<1.5', mandatory: true, category: 'rf' },
      { id: 'i2', testName: 'PIM', testProcedure: 'measure', expectedResult: '<-150', passCriteria: '<-150', mandatory: false, category: 'rf' },
    ] },
    { id: 'sec2', title: 'Power', order: 2, items: [
      { id: 'i3', testName: 'Voltage', testProcedure: 'measure', expectedResult: '48V', passCriteria: '46-50V', mandatory: true, category: 'power' },
    ] },
  ],
}

describe('factories', () => {
  it('newCheckItem is a blank, non-mandatory rf item with an id', () => {
    const item = newCheckItem()
    expect(item.id).toBeTruthy()
    expect(item).toMatchObject({ testName: '', mandatory: false, category: 'rf' })
  })

  it('newSection carries the given order', () => {
    expect(newSection(3)).toMatchObject({ order: 3, items: [] })
  })
})

describe('templateItems', () => {
  it('flattens items in section order', () => {
    expect(templateItems(template).map(i => i.id)).toEqual(['i1', 'i2', 'i3'])
    expect(templateItems(null)).toEqual([])
  })
})

describe('buildResultsForTemplate', () => {
  it('creates one pending row per item when nothing is saved', () => {
    const rows = buildResultsForTemplate(template)
    expect(rows.map(r => r.itemId)).toEqual(['i1', 'i2', 'i3'])
    expect(rows.every(r => r.result === 'pending')).toBe(true)
  })

  it('keeps already-saved values matched by itemId', () => {
    const saved: ATPResult[] = [{ itemId: 'i1', result: 'pass', actualValue: '1.2', notes: '' }]
    const rows = buildResultsForTemplate(template, saved)
    expect(rows.find(r => r.itemId === 'i1')).toMatchObject({ result: 'pass', actualValue: '1.2' })
    expect(rows.find(r => r.itemId === 'i2')?.result).toBe('pending')
  })

  it('drops results whose item no longer exists and returns [] without a template', () => {
    const rows = buildResultsForTemplate(template, [{ itemId: 'gone', result: 'pass', actualValue: '', notes: '' }])
    expect(rows.find(r => r.itemId === 'gone')).toBeUndefined()
    expect(buildResultsForTemplate(null)).toEqual([])
  })
})

describe('summarizeResults', () => {
  const r = (itemId: string, result: ATPResult['result']): ATPResult => ({ itemId, result, actualValue: '', notes: '' })

  it('passes only when there are passes and no failures', () => {
    expect(summarizeResults([r('a', 'pass'), r('b', 'pass'), r('c', 'na')]))
      .toEqual({ passCount: 2, failCount: 0, naCount: 1, overallResult: 'pass' })
  })

  it('is partial on a mix of pass and fail', () => {
    expect(summarizeResults([r('a', 'pass'), r('b', 'fail')]))
      .toMatchObject({ passCount: 1, failCount: 1, overallResult: 'partial' })
  })

  it('fails when nothing passed', () => {
    expect(summarizeResults([r('a', 'fail'), r('b', 'fail')]))
      .toMatchObject({ failCount: 2, overallResult: 'fail' })
  })

  it('is partial while everything is still pending or n/a', () => {
    expect(summarizeResults([r('a', 'pending'), r('b', 'na')])).toMatchObject({ overallResult: 'partial' })
    expect(summarizeResults([])).toEqual({ passCount: 0, failCount: 0, naCount: 0, overallResult: 'partial' })
  })
})

describe('emptyResultFor', () => {
  it('is a pending row for the item', () => {
    expect(emptyResultFor('x')).toEqual({ itemId: 'x', result: 'pending', actualValue: '', notes: '' })
  })
})
