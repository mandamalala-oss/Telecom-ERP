import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCSV, parseMSProjectCSV, parseMSProjectXML } from './msProjectImport'

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

describe('parseMSProjectXML', () => {
  const SAMPLE = `<?xml version="1.0"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Tasks>
    <Task><UID>1</UID><Name>INSTALLATION</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary>
      <Start>2026-06-01T07:00:00</Start><Finish>2026-06-05T17:00:00</Finish>
      <PercentComplete>50</PercentComplete><Duration>PT40H0M0S</Duration><Milestone>0</Milestone>
      <Notes>A&amp;B &lt;top&gt; task</Notes>
    </Task>
    <Task><UID>2</UID><Name>PREPARATION</Name><OutlineLevel>2</OutlineLevel><Summary>0</Summary>
      <Start>2026-06-01T07:00:00</Start><Finish>2026-06-01T17:00:00</Finish>
      <PercentComplete>100</PercentComplete><Duration>PT9H0M0S</Duration><Milestone>0</Milestone>
    </Task>
    <Task><UID>3</UID><Name>TRAVEL &amp; CAR</Name><OutlineLevel>2</OutlineLevel><Summary>0</Summary>
      <Start>2026-06-02T07:00:00</Start><Finish>2026-06-03T17:00:00</Finish>
      <PercentComplete>0</PercentComplete><Duration>PT18H0M0S</Duration><Milestone>0</Milestone>
      <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type></PredecessorLink>
    </Task>
    <Task><UID>4</UID><Name>COMMISSIONING</Name><OutlineLevel>2</OutlineLevel><Summary>1</Summary>
      <Start>2026-06-04T07:00:00</Start><Finish>2026-06-04T07:00:00</Finish>
      <PercentComplete>0</PercentComplete><Duration>PT0H0M0S</Duration><Milestone>1</Milestone>
    </Task>
    <Task><UID>5</UID><Name>ON-SITE TEST</Name><OutlineLevel>3</OutlineLevel><Summary>0</Summary>
      <Start>2026-06-04T07:00:00</Start><Finish>2026-06-04T17:00:00</Finish>
      <PercentComplete>0</PercentComplete><Duration>PT9H0M0S</Duration><Milestone>0</Milestone>
      <PredecessorLink><PredecessorUID>3</PredecessorUID></PredecessorLink>
    </Task>
  </Tasks>
  <Resources>
    <Resource><UID>10</UID><Name>ALICE LEADER</Name><Type>1</Type><IsCostResource>0</IsCostResource></Resource>
    <Resource><UID>11</UID><Name>FUEL</Name><Type>0</Type><IsCostResource>0</IsCostResource></Resource>
  </Resources>
  <Assignments>
    <Assignment><TaskUID>2</TaskUID><ResourceUID>10</ResourceUID></Assignment>
    <Assignment><TaskUID>2</TaskUID><ResourceUID>11</ResourceUID></Assignment>
    <Assignment><TaskUID>3</TaskUID><ResourceUID>99</ResourceUID></Assignment>
  </Assignments>
</Project>`

  it('imports parents and children with parentId, dates and decoded entities', () => {
    const result = parseMSProjectXML(SAMPLE, options)
    expect(result.tasks).toHaveLength(5)

    const byTitle = Object.fromEntries(result.tasks.map((t) => [t.title, t]))
    const install = byTitle['INSTALLATION']
    const preparation = byTitle['PREPARATION']
    const commissioning = byTitle['COMMISSIONING']
    const onSiteTest = byTitle['ON-SITE TEST']

    expect(install.parentId).toBeUndefined()
    // All level-2 tasks nest under the level-1 summary.
    const childrenOfInstall = result.tasks.filter((t) => t.parentId === install.id).map((t) => t.title)
    expect(childrenOfInstall).toEqual(expect.arrayContaining(['PREPARATION', 'TRAVEL & CAR', 'COMMISSIONING']))
    expect(preparation.parentId).toBe(install.id)
    expect(install.description).toBe('A&B <top> task')

    // Level-3 task nests under its level-2 summary parent.
    expect(onSiteTest.parentId).toBe(commissioning.id)

    expect(preparation).toMatchObject({
      startDate: '2026-06-01', dueDate: '2026-06-01', status: 'done',
      assigneeId: 'u1', assigneeName: 'Alice Leader',
    })
    // Material resource (FUEL) is not an assignee; only the person is mapped.
    expect(preparation.description).not.toContain('FUEL')
  })

  it('decodes titles, resolves predecessors, and flags milestones', () => {
    const result = parseMSProjectXML(SAMPLE, options)
    const byTitle = Object.fromEntries(result.tasks.map((t) => [t.title, t]))
    const travel = byTitle['TRAVEL & CAR']
    const onSiteTest = byTitle['ON-SITE TEST']
    const preparation = byTitle['PREPARATION']

    expect(travel.title).toBe('TRAVEL & CAR')
    expect(travel.dependencies).toEqual([preparation.id])
    expect(onSiteTest.dependencies).toEqual([travel.id])
    expect(byTitle['COMMISSIONING'].isMilestone).toBe(true)
    expect(preparation.isMilestone).toBe(false)
    expect(result.unresolvedDependencies).toEqual([])
    expect(result.unresolvedAssignees).toEqual([])
  })

  it('reports a non-XML payload', () => {
    const result = parseMSProjectXML('hello,not,xml', options)
    expect(result.tasks).toHaveLength(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

// Children of a task, by id (parents always precede children in the batch).
describe('parseMSProjectXML (NOKIA sample file)', () => {
  it('imports the real French-language sample with correct hierarchy', () => {
    const file = resolve(process.cwd(), 'NOKIA PROJECT -1SM-1RFM.xml')
    if (!existsSync(file)) return // sample not present in this checkout

    const result = parseMSProjectXML(readFileSync(file, 'utf8'), options)
    const titles = result.tasks.map((t) => t.title)
    // The file-level root task (its name equals the project) is skipped.
    expect(titles).not.toContain('NOKIA PROJECT')
    expect(titles).toContain('INSTALLATION NOKIA')
    expect(titles).toContain('TRAVEL')
    expect(titles).toContain('TRAVEL WITH CAR')

    const byTitle = Object.fromEntries(result.tasks.map((t) => [t.title, t]))
    expect(byTitle['TRAVEL WITH CAR'].parentId).toBe(byTitle['TRAVEL'].id)
    expect(byTitle['QA AND CHECKING'].parentId).toBe(byTitle['INTEGRATION & NETWORK TEST & QA'].id)
    // No resource in the sample is a person (work) resource, so no assignees.
    expect(result.unresolvedAssignees).toEqual([])
  })
})
