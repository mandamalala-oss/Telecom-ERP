import { describe, expect, it } from 'vitest'
import { parseCSV, parseMSProjectCSV } from './msProjectImport'

const options = {
  projectId: 'p1',
  projectName: 'Alpha',
  phase: 'installation' as const,
  dateLocale: 'dmy' as const,
  users: [{ id: 'u1', name: 'Alice Leader' }],
}

describe('parseCSV', () => {
  it('handles quoted commas, escaped quotes, and embedded newlines', () => {
    expect(parseCSV('ID,Task Name\n1,"Cable, install"\n2,"Quote ""test""\ncontinued"')).toEqual([
      ['ID', 'Task Name'],
      ['1', 'Cable, install'],
      ['2', 'Quote "test"\ncontinued'],
    ])
  })
})

describe('parseMSProjectCSV', () => {
  it('maps fields, resolves predecessors in a second pass, and maps resources', () => {
    const csv = [
      'ID,Task Name,Start,Finish,% Complete,Predecessors,Resource Names,Duration,Notes,Summary',
      '1,Survey,05/08/2026,06/08/2026,40,,Alice Leader,2 days,Initial survey,No',
      '2,"Install, RRU",07/08/2026,10/08/2026,100,1FS+2 days,Alice Leader;Bob Unknown,4 days,,No',
      '3,Summary,01/08/2026,10/08/2026,0,, ,10 days,,Yes',
      '4,Blocked,11/08/2026,12/08/2026,70,99FS, ,2 days,,No',
    ].join('\n')
    const result = parseMSProjectCSV(csv, options)

    expect(result.tasks).toHaveLength(3)
    expect(result.tasks[0]).toMatchObject({
      projectId: 'p1', projectName: 'Alpha', title: 'Survey', startDate: '2026-08-05', dueDate: '2026-08-06',
      status: 'in_progress', assigneeId: 'u1', assigneeName: 'Alice Leader', phase: 'installation',
    })
    expect(result.tasks[1].dependencies).toEqual([result.tasks[0].id])
    expect(result.tasks[1].description).toContain('Additional resources: Bob Unknown')
    expect(result.tasks[1].assigneeId).toBe('u1')
    expect(result.unresolvedDependencies).toEqual([{ taskName: 'Blocked', predecessorId: '99' }])
    expect(result.unresolvedAssignees).toEqual([])
  })

  it('supports month/day locale and detects zero-duration milestones', () => {
    const result = parseMSProjectCSV(
      'ID,Task Name,Start,Finish,% Complete,Duration,Resource Names\n1,ATP,08/15/2026,08/15/2026,100,0 days,Unknown',
      { ...options, dateLocale: 'mdy' }
    )
    expect(result.tasks[0]).toMatchObject({ startDate: '2026-08-15', dueDate: '2026-08-15', isMilestone: true, status: 'done' })
    expect(result.unresolvedAssignees).toEqual([{ taskName: 'ATP', resourceName: 'Unknown' }])
  })

  it('skips rows without ID/name and reports invalid dates without failing the batch', () => {
    const result = parseMSProjectCSV(
      'ID,Task Name,Start,Finish\n,Blank,01/01/2026,02/01/2026\n2,Invalid,31/02/2026,03/03/2026',
      options
    )
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].startDate).toBe('')
    expect(result.tasks[0].dueDate).toBe('2026-03-03')
    expect(result.errors).toHaveLength(1)
  })
})
