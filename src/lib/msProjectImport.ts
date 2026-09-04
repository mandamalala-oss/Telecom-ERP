import type { Task, TaskPriority, TaskStatus, ProjectPhase, User } from '@/types'

export type MSProjectDateLocale = 'dmy' | 'mdy'

export interface MSProjectImportOptions {
  projectId: string
  projectName: string
  phase: ProjectPhase
  dateLocale: MSProjectDateLocale
  users: Pick<User, 'id' | 'name'>[]
}

export interface UnresolvedDependency {
  taskName: string
  predecessorId: string
}

export interface UnresolvedAssignee {
  taskName: string
  resourceName: string
}

/** Per-task assignment breakdown for the import preview. */
export interface TaskAssignmentInfo {
  taskId: string
  /** Work (person) resources assigned, in file order. */
  personNames: string[]
  /** Equipment/material/cost resources assigned — intentionally not assignees. */
  materialNames: string[]
  /** ERP user name the first person name matched, if any. */
  matchedName?: string
}

export interface MSProjectImportResult {
  tasks: Task[]
  unresolvedDependencies: UnresolvedDependency[]
  unresolvedAssignees: UnresolvedAssignee[]
  /** Present for XML imports; keyed to each imported task by id. */
  assignments?: TaskAssignmentInfo[]
  errors: string[]
}

const STATUS_BUCKETS: { max: number; status: TaskStatus }[] = [
  { max: 25, status: 'todo' },
  { max: 62.5, status: 'in_progress' },
  { max: 87.5, status: 'review' },
  { max: 100, status: 'done' },
]

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical']

const str = (value: unknown) => (value === undefined || value === null ? '' : String(value).trim())
const normalized = (value: unknown) => str(value).toLowerCase().replace(/[\s_-]+/g, ' ')

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** RFC 4180-compatible CSV parser, including quoted commas and newlines. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
    } else if (char === '"' && field === '') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((value) => value.trim() !== '')) rows.push(row)
  }
  if (rows[0]?.[0]?.charCodeAt(0) === 0xfeff) rows[0][0] = rows[0][0].slice(1)
  return rows
}

function headerIndex(headers: string[], names: string[]) {
  return headers.findIndex((header) => names.includes(normalized(header)))
}

function parseDate(value: string, locale: MSProjectDateLocale): string | undefined {
  const raw = str(value)
  if (!raw) return undefined
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`

  const parts = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
  if (!parts) return undefined
  const first = Number(parts[1])
  const second = Number(parts[2])
  let year = Number(parts[3])
  if (year < 100) year += year >= 70 ? 1900 : 2000
  const day = locale === 'dmy' ? first : second
  const month = locale === 'dmy' ? second : first
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return undefined
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parsePercent(value: string): number {
  const match = str(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  if (!match) return 0
  return Math.max(0, Math.min(100, Number(match[0])))
}

function parsePriority(value: string): TaskPriority {
  const raw = normalized(value)
  return PRIORITIES.find((priority) => priority === raw) ?? 'medium'
}

function parseDurationDays(value: string): number | undefined {
  const raw = str(value).toLowerCase().replace(',', '.')
  if (!raw) return undefined
  const match = raw.match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : undefined
}

function resources(value: string) {
  return value.split(/[;,]/).map((name) => name.trim()).filter(Boolean)
}

function predecessorIds(value: string) {
  return value.split(',').map((part) => part.trim()).filter(Boolean).map((part) => part.match(/^(\d+)/)?.[1]).filter((id): id is string => !!id)
}

function statusFromPercent(percent: number): TaskStatus {
  return STATUS_BUCKETS.find((bucket) => percent <= bucket.max)?.status ?? 'done'
}

/** Parse an MS Project CSV export into UUID-backed tasks. */
export function parseMSProjectCSV(csv: string, options: MSProjectImportOptions): MSProjectImportResult {
  const rows = parseCSV(csv)
  if (rows.length < 2) return { tasks: [], unresolvedDependencies: [], unresolvedAssignees: [], errors: ['The CSV has no task rows.'] }

  const headers = rows[0].map(normalized)
  const idAt = headerIndex(headers, ['id', 'task id'])
  const nameAt = headerIndex(headers, ['task name', 'name', 'task'])
  if (idAt < 0 || nameAt < 0) {
    return { tasks: [], unresolvedDependencies: [], unresolvedAssignees: [], errors: ['Missing required columns: ID and Task Name.'] }
  }

  const startAt = headerIndex(headers, ['start', 'start date'])
  const finishAt = headerIndex(headers, ['finish', 'finish date', 'due date'])
  const percentAt = headerIndex(headers, ['% complete', 'percent complete', 'complete'])
  const predecessorsAt = headerIndex(headers, ['predecessors', 'predecessor'])
  const resourcesAt = headerIndex(headers, ['resource names', 'resource name', 'resources'])
  const durationAt = headerIndex(headers, ['duration'])
  const priorityAt = headerIndex(headers, ['priority'])
  const summaryAt = headerIndex(headers, ['summary', 'is summary'])
  const descriptionAt = headerIndex(headers, ['notes', 'description'])

  type RawRow = { sourceId: string; rowNumber: number; name: string; startDate?: string; dueDate?: string; percent: number; predecessorIds: string[]; resourceNames: string[]; duration?: number; priority: TaskPriority; summary: boolean; description: string }
  const rawRows: RawRow[] = []
  const errors: string[] = []

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2
    const sourceId = str(row[idAt])
    const name = str(row[nameAt])
    if (!sourceId || !name) return
    const summary = summaryAt >= 0 && ['yes', 'true', '1', 'y'].includes(normalized(row[summaryAt]))
    if (summary) return
    const startDate = startAt >= 0 ? parseDate(row[startAt], options.dateLocale) : undefined
    const dueDate = finishAt >= 0 ? parseDate(row[finishAt], options.dateLocale) : undefined
    if (startAt >= 0 && str(row[startAt]) && !startDate) errors.push(`Row ${rowNumber} (${name}): invalid Start date, left blank`)
    if (finishAt >= 0 && str(row[finishAt]) && !dueDate) errors.push(`Row ${rowNumber} (${name}): invalid Finish date, left blank`)
    rawRows.push({
      sourceId,
      rowNumber,
      name,
      startDate,
      dueDate,
      percent: percentAt >= 0 ? parsePercent(row[percentAt]) : 0,
      predecessorIds: predecessorsAt >= 0 ? predecessorIds(str(row[predecessorsAt])) : [],
      resourceNames: resources(resourcesAt >= 0 ? str(row[resourcesAt]) : ''),
      duration: durationAt >= 0 ? parseDurationDays(str(row[durationAt])) : undefined,
      priority: priorityAt >= 0 ? parsePriority(str(row[priorityAt])) : 'medium',
      summary: false,
      description: descriptionAt >= 0 ? str(row[descriptionAt]) : '',
    })
  })

  const userByName = new Map(options.users.map((user) => [normalized(user.name), user]))
  const idBySourceId = new Map<string, string>()
  const tasks: Task[] = rawRows.map((raw) => {
    const id = makeId()
    idBySourceId.set(raw.sourceId, id)
    const firstResource = raw.resourceNames[0]
    const user = firstResource ? userByName.get(normalized(firstResource)) : undefined
    return {
      id,
      projectId: options.projectId,
      projectName: options.projectName,
      title: raw.name,
      description: raw.resourceNames.length > 1
        ? `${raw.description}${raw.description ? '\n' : ''}Additional resources: ${raw.resourceNames.slice(1).join(', ')}`
        : raw.description,
      status: statusFromPercent(raw.percent),
      priority: raw.priority,
      assigneeId: user?.id ?? '',
      assigneeName: user?.name ?? firstResource ?? '',
      startDate: raw.startDate ?? '',
      dueDate: raw.dueDate ?? '',
      isMilestone: raw.duration === 0,
      estimatedHours: 0,
      loggedHours: 0,
      phase: options.phase,
      dependencies: [],
      tags: [],
      createdAt: '',
    }
  })

  const unresolvedDependencies: UnresolvedDependency[] = []
  const unresolvedAssignees: UnresolvedAssignee[] = []
  rawRows.forEach((raw, index) => {
    const task = tasks[index]
    task.dependencies = raw.predecessorIds.flatMap((sourceId) => {
      const resolved = idBySourceId.get(sourceId)
      if (resolved) return [resolved]
      unresolvedDependencies.push({ taskName: raw.name, predecessorId: sourceId })
      return []
    })
    const firstResource = raw.resourceNames[0]
    if (firstResource && !userByName.has(normalized(firstResource))) {
      unresolvedAssignees.push({ taskName: raw.name, resourceName: firstResource })
    }
  })

  return { tasks, unresolvedDependencies, unresolvedAssignees, errors }
}

// ─── MS Project XML ─────────────────────────────────────────────────────────
// Microsoft Project's own file format (the *.xml saved from Project Desktop,
// root element <Project xmlns="http://schemas.microsoft.com/project">). The
// schema uses fixed English element names (Name, Start, Finish, Summary,
// OutlineLevel, PredecessorUID, ...) and the file itself is never localized,
// so the same parser handles both French and English project files.
//
// Language is NOT the variance to worry about here — it's date "formats".
// MS Project writes ISO-8601 datetimes (2026-06-01T07:00:00), but exports from
// other tools or hand-edits can arrive as bare dates in any layout, so dates
// are pushed through the same tolerant parseDate() used by the CSV importer.

function decodeXmlEntities(text: string): string {
  return str(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Inner contents of every <tag>…</tag> block. Blocks never nest the same tag. */
function xmlBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = []
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) blocks.push(match[1])
  return blocks
}

/** First <tag>…</tag> child value, trimmed. */
function xmlChild(block: string, tag: string): string {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(block)
  return match ? str(match[1]) : ''
}

/** Every <tag>…</tag> value within a block (e.g. several <PredecessorUID>). */
function xmlChildren(block: string, tag: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(block)) !== null) out.push(str(match[1]))
  return out
}

/** A duration like PT0H0M0S or PT0M0S is a zero-length (milestone) duration. */
function isZeroDuration(value: string): boolean {
  const match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(str(value))
  if (!match) return false
  return (Number(match[1]) || 0) + (Number(match[2]) || 0) / 60 + (Number(match[3]) || 0) / 3600 === 0
}

interface RawXMLTask {
  uid: string
  name: string
  level: number
  summary: boolean
  milestone: boolean
  startDate?: string
  dueDate?: string
  percent: number
  predecessorUids: string[]
  assigneeNames: string[]
  materialNames: string[]
  notes: string
  parentUid?: string
}

/** Parse a Microsoft Project XML file into UUID-backed tasks with subtasks. */
export function parseMSProjectXML(xml: string, options: MSProjectImportOptions): MSProjectImportResult {
  const taskBlocks = xmlBlocks(xml, 'Task')
  if (taskBlocks.length === 0) {
    return { tasks: [], unresolvedDependencies: [], unresolvedAssignees: [], errors: ['Not a valid MS Project XML file (no <Task> elements found).'] }
  }

  // Resources: a task's assignee is a *work* resource (type 1 / person), never
  // a material (type 0) or cost resource. Many exports mix equipment/fuel rows
  // in with people, so we split assignments into people vs. material/cost and
  // surface both to the preview instead of silently treating either wrong.
  const resourceType = new Map<string, string>()
  const resourceIsCost = new Map<string, string>()
  const resourceName = new Map<string, string>()
  for (const block of xmlBlocks(xml, 'Resource')) {
    const uid = xmlChild(block, 'UID')
    if (!uid) continue
    resourceType.set(uid, xmlChild(block, 'Type'))
    resourceIsCost.set(uid, xmlChild(block, 'IsCostResource'))
    const name = decodeXmlEntities(xmlChild(block, 'Name'))
    if (name) resourceName.set(uid, name)
  }
  const isPersonResource = (uid: string): boolean => {
    const name = resourceName.get(uid)
    if (!name) return false
    if (resourceIsCost.get(uid) === '1') return false
    const type = resourceType.get(uid)
    // Work resources are type 1; a missing Type (older exports) also implies a
    // person. Material rows (type 0) and cost rows are excluded.
    return type === '1' || type === ''
  }

  // Assignments → ordered people per task and ordered material/cost names.
  const taskAssignees = new Map<string, string[]>()
  const taskMaterials = new Map<string, string[]>()
  for (const block of xmlBlocks(xml, 'Assignment')) {
    const taskUid = xmlChild(block, 'TaskUID')
    const resourceUid = xmlChild(block, 'ResourceUID')
    const name = resourceName.get(resourceUid)
    if (!taskUid || !resourceUid || !name) continue
    const target = isPersonResource(resourceUid) ? taskAssignees : taskMaterials
    const names = target.get(taskUid) ?? []
    if (!names.includes(name)) names.push(name)
    target.set(taskUid, names)
  }

  // Walk tasks in document (outline) order. Parents always precede children, so
  // the most recent importable task at (level - 1) is the current parent.
  const raws: RawXMLTask[] = []
  const lastAtLevel = new Map<number, string>()
  for (const block of taskBlocks) {
    const uid = xmlChild(block, 'UID')
    const name = decodeXmlEntities(xmlChild(block, 'Name'))
    if (!uid || !name) continue

    let level = Number(xmlChild(block, 'OutlineLevel'))
    if (!Number.isInteger(level) || level < 0) {
      const outlineNumber = xmlChild(block, 'OutlineNumber')
      level = outlineNumber ? outlineNumber.split('.').length : 1
    }
    // Level 0 is the file's own project row (its name equals the project) —
    // importing it would duplicate the parent project. Skip it.
    if (level <= 0) continue

    const summary = xmlChild(block, 'Summary') === '1'
    const notes = decodeXmlEntities(xmlChild(block, 'Notes'))
    const assignees = taskAssignees.get(uid) ?? []
    raws.push({
      uid,
      name,
      level,
      summary,
      milestone: xmlChild(block, 'Milestone') === '1' || (!summary && isZeroDuration(xmlChild(block, 'Duration'))),
      startDate: parseDate(xmlChild(block, 'Start') || xmlChild(block, 'ManualStart'), options.dateLocale),
      dueDate: parseDate(xmlChild(block, 'Finish') || xmlChild(block, 'ManualFinish'), options.dateLocale),
      percent: Number(str(xmlChild(block, 'PercentComplete'))) || 0,
      predecessorUids: xmlChildren(block, 'PredecessorUID'),
      assigneeNames: assignees,
      materialNames: taskMaterials.get(uid) ?? [],
      notes,
      parentUid: lastAtLevel.get(level - 1),
    })
    lastAtLevel.set(level, uid)
  }
  if (raws.length === 0) {
    return { tasks: [], unresolvedDependencies: [], unresolvedAssignees: [], errors: ['The XML has no importable task rows.'] }
  }

  const userByName = new Map(options.users.map((user) => [normalized(user.name), user]))
  const idByUid = new Map<string, string>()
  raws.forEach((raw) => idByUid.set(raw.uid, makeId()))

  const tasks: Task[] = []
  const assignments: TaskAssignmentInfo[] = []
  raws.forEach((raw) => {
    const id = idByUid.get(raw.uid)!
    const firstAssignee = raw.assigneeNames[0]
    const user = firstAssignee ? userByName.get(normalized(firstAssignee)) : undefined
    const extras = raw.assigneeNames.slice(1)
    const description = extras.length > 0
      ? `${raw.notes}${raw.notes ? '\n' : ''}Additional resources: ${extras.join(', ')}`
      : raw.notes
    const parentId = raw.parentUid ? idByUid.get(raw.parentUid) : undefined
    tasks.push({
      id,
      projectId: options.projectId,
      projectName: options.projectName,
      title: raw.name,
      description,
      status: statusFromPercent(raw.percent),
      priority: 'medium' as TaskPriority,
      assigneeId: user?.id ?? '',
      assigneeName: user?.name ?? firstAssignee ?? '',
      startDate: raw.startDate ?? '',
      dueDate: raw.dueDate ?? '',
      parentId: parentId ? parentId : undefined,
      isMilestone: raw.milestone,
      estimatedHours: 0,
      loggedHours: 0,
      phase: options.phase,
      dependencies: [],
      tags: [],
      createdAt: '',
    })
    assignments.push({
      taskId: id,
      personNames: raw.assigneeNames,
      materialNames: raw.materialNames,
      matchedName: user?.name,
    })
  })

  const unresolvedDependencies: UnresolvedDependency[] = []
  const unresolvedAssignees: UnresolvedAssignee[] = []
  raws.forEach((raw, index) => {
    const task = tasks[index]
    task.dependencies = raw.predecessorUids.flatMap((predecessorUid) => {
      const resolved = idByUid.get(predecessorUid)
      if (resolved) return [resolved]
      unresolvedDependencies.push({ taskName: raw.name, predecessorId: predecessorUid })
      return []
    })
    // Only a *person* resource that can't be matched to an ERP user is flagged
    // as unresolved. Equipment/material/cost resources are expected and shown
    // separately in the preview, not reported as missing assignees.
    const firstAssignee = raw.assigneeNames[0]
    if (firstAssignee && !userByName.has(normalized(firstAssignee))) {
      unresolvedAssignees.push({ taskName: raw.name, resourceName: firstAssignee })
    }
  })

  return { tasks, unresolvedDependencies, unresolvedAssignees, assignments, errors: [] }
}
