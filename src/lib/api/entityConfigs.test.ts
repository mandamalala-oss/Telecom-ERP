import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TABLES, FIELD_CONFIGS } from './entityConfigs'
import { toSnake } from './case'

// Guards the invariant behind the "blank New/Edit forms" bug: every table
// in the schema must have a TABLES entry AND a FIELD_CONFIGS entry, and
// every form field must map to a real schema column (snake_case).
const schemaPath = fileURLToPath(new URL('../../../database/schema.sql', import.meta.url))

const FIELD_TYPES = ['text', 'textarea', 'number', 'date', 'select', 'checkbox', 'tags', 'multiSelect', 'sitePicker']

/** Parse `database/schema.sql` into { tableName: Set<columnName> }. */
function parseSchema(): Record<string, Set<string>> {
  const sql = readFileSync(schemaPath, 'utf8')
  const tables: Record<string, Set<string>> = {}
  const blockRe = /^create table (\w+) \(([\s\S]*?)\n\);/gm
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(sql))) {
    const cols = new Set<string>()
    for (const line of m[2].split('\n')) {
      const cm = line.match(/^\s{2}(\w+)\s/)
      if (cm) cols.add(cm[1])
    }
    tables[m[1]] = cols
  }
  return tables
}

const tableNames = Object.values(TABLES)
const schema = parseSchema()

describe('FIELD_CONFIGS ↔ database/schema.sql', () => {
  it('schema defines exactly the 31 app tables', () => {
    expect(Object.keys(schema).length).toBe(tableNames.length)
  })

  it('every schema table has a TABLES entry', () => {
    for (const t of Object.keys(schema)) {
      expect(tableNames).toContain(t)
    }
  })

  it('every TABLES entry exists in the schema', () => {
    for (const t of tableNames) {
      expect(schema[t], `table "${t}" not found in database/schema.sql`).toBeDefined()
    }
  })

  it('every TABLES entry has a FIELD_CONFIGS (no blank forms)', () => {
    for (const t of tableNames) {
      expect(FIELD_CONFIGS[t], `missing FIELD_CONFIGS for table "${t}"`).toBeDefined()
      expect(FIELD_CONFIGS[t].length, `FIELD_CONFIGS["${t}"] is empty`).toBeGreaterThan(0)
    }
  })

  it('FIELD_CONFIGS has no orphan tables', () => {
    for (const t of Object.keys(FIELD_CONFIGS)) {
      expect(tableNames).toContain(t)
    }
  })

  it('every field key maps to a real schema column (snake_case)', () => {
    for (const t of tableNames) {
      const cols = schema[t]
      expect(cols).toBeDefined()
      for (const f of FIELD_CONFIGS[t]) {
        // Virtual fields (e.g. multiSelect site links) are handled as side
        // effects and never touch the table row — no column required.
        if (f.virtual) continue
        expect(
          cols.has(toSnake(f.key)),
          `config ${t}.${f.key} → column "${toSnake(f.key)}" does not exist in schema table "${t}"`
        ).toBe(true)
      }
    }
  })

  it('every field uses a valid FieldType', () => {
    for (const t of tableNames) {
      for (const f of FIELD_CONFIGS[t]) {
        expect(FIELD_TYPES, `config ${t}.${f.key} has type "${f.type}"`).toContain(f.type)
      }
    }
  })

  it('every lookup targets an existing table and existing columns', () => {
    for (const t of tableNames) {
      for (const f of FIELD_CONFIGS[t]) {
        if (!f.lookup) continue
        const lt = f.lookup.table
        expect(tableNames, `lookup ${t}.${f.key} → table "${lt}" not in TABLES`).toContain(lt)
        const lcols = schema[lt]
        expect(lcols, `lookup table "${lt}" missing from schema`).toBeDefined()
        // Lookup keys are camelCase *app-shape* row keys — rows arrive via
        // makeApi().list() already keysToCamel'd — so snake-case before
        // comparing against raw DB columns.
        for (const c of [f.lookup.valueKey, f.lookup.labelKey]) {
          expect(lcols.has(toSnake(c)), `lookup ${t}.${f.key} → ${lt}.${c} does not exist (column ${toSnake(c)})`).toBe(true)
        }
        if (f.lookup.orderBy) {
          expect(lcols.has(toSnake(f.lookup.orderBy)), `lookup orderBy ${lt}.${f.lookup.orderBy} does not exist`).toBe(true)
        }
        if (f.lookup.populate) {
          // populate maps formField → lookupRowField. The form field may be a
          // hidden FK (e.g. projectId, siteId) not shown in the form — that's
          // by design — so only the lookup-side row field must exist.
          for (const rowField of Object.values(f.lookup.populate)) {
            expect(lcols.has(toSnake(rowField)), `lookup populate ${t}.${f.key} → ${lt}.${rowField} does not exist`).toBe(true)
          }
        }
      }
    }
  })
})
