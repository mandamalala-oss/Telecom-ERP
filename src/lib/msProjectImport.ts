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

export interface MSProjectImportResult {
  tasks: Task[]
  unresolvedDependencies: UnresolvedDependency[]
  unresolvedAssignees: UnresolvedAssignee[]
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
