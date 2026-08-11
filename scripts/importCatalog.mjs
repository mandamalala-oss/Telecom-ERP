#!/usr/bin/env node
/**
 * One-off import: BOQ.csv / MW.csv → catalog_items (Supabase).
 *
 * Usage:
 *   node scripts/importCatalog.mjs --file BOQ.csv --network RAN [--dry-run]
 *   node scripts/importCatalog.mjs --file MW.csv  --network MW  [--dry-run]
 *
 * Environment (never hardcoded):
 *   SUPABASE_URL            — falls back to VITE_SUPABASE_URL from .env
 *   SUPABASE_SERVICE_ROLE_KEY — required unless --dry-run
 *
 * Handles the messy source data:
 *   - UTF-8 BOM + comma-delimited, parsed with csv-parse (a proper parser),
 *     so quoted cells containing literal \t tabs or embedded newlines
 *     (e.g. the P443032 row that spans two lines) come back intact.
 *   - Contract values like `_-* 400000_-` → 400000 via /_-\*\s*(\d+)\s*_-/.
 *   - Trailing summary row (empty SI, total only in Contract) is skipped.
 *   - default_qty = QTY column when present, else 1.
 *   - network_type is set from --network (BOQ.csv → RAN, MW.csv → MW).
 *
 * Prints a summary of rows imported and any skipped/malformed rows.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parse } from 'csv-parse/sync'

// ── tiny .env loader (VITE_ vars only; real secrets come from the shell) ──
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (!a.startsWith('--')) continue
  const next = process.argv[i + 1]
  if (next && !next.startsWith('--')) { args[a.slice(2)] = next; i++ }
  else args[a.slice(2)] = true
}
const file = args.file ?? 'BOQ.csv'
const network = String(args.network ?? '').toUpperCase()
const dryRun = Boolean(args['dry-run'])

if (!['RAN', 'MW'].includes(network)) {
  console.error('Usage: node scripts/importCatalog.mjs --file BOQ.csv --network RAN|MW [--dry-run]')
  process.exit(2)
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  console.error('Missing SUPABASE_URL (or VITE_SUPABASE_URL in .env).')
  process.exit(2)
}
if (!dryRun && !serviceRoleKey) {
  console.error(
    'Missing SUPABASE_SERVICE_ROLE_KEY. Export it (or add it to .env) — it is never hardcoded. ' +
    'Use --dry-run to validate parsing without DB access.'
  )
  process.exit(2)
}

const CONTRACT_RE = /_-\*\s*(\d+)\s*_-/

// Locate columns by header text — BOQ.csv and MW.csv differ.
function findHeader(headers, patterns) {
  return headers.findIndex((h, i) => i > 0 && patterns.some((p) => p.test(String(h).trim())))
}

const rows = parse(readFileSync(file, 'utf8'), {
  bom: true,      // strip UTF-8 BOM
  relax_column_count: true, // MW.csv has stray extra empty cells in some rows
  skip_empty_lines: true,
})

// MW.csv headers are ('Product ID Product No', 'Product Description', …) with
// no SI cell, so locate the header row by its Contract/QTY/Product-ID cells.
const headerIdx = rows.findIndex((r) =>
  r.length > 1 &&
  r.some((c) => /contract(ed)?$/i.test(String(c).trim())) &&
  r.some((c) => /product id|^si$/i.test(String(c).trim()))
)
if (headerIdx < 0) {
  console.error(`Could not locate the header row in ${file}.`)
  process.exit(2)
}
const headers = rows[headerIdx]
const col = {
  code: findHeader(headers, [/^SI$/i, /product id/i]),
  desc: findHeader(headers, [/new description/i, /product description/i]),
  comments: findHeader(headers, [/^comments$/i]),
  unit: findHeader(headers, [/^unit$/i]),
  contract: findHeader(headers, [/contract(ed)?$/i]),
  qty: findHeader(headers, [/^qty$/i]),
  remarks: findHeader(headers, [/^remarks$/i]),
}
if (col.code < 0 || col.desc < 0 || col.contract < 0) {
  console.error(`Missing required columns (SI, description, contract) in ${file}:`, headers)
  process.exit(2)
}

const out = []
const skipped = [] // { line, reason }
const seenCodes = new Map() // item_code → count, to flag duplicates

for (const [i, row] of rows.entries()) {
  if (i <= headerIdx) continue
  const code = String(row[col.code] ?? '').trim()
  const contract = String(row[col.contract] ?? '').trim()

  // Trailing summary row: empty SI, only a total in Contract — skip quietly.
  if (!code && contract) continue
  // Fully empty line — skip quietly.
  if (!code && !contract && row.every((c) => String(c ?? '').trim() === '')) continue

  const costMatch = contract.match(CONTRACT_RE)
  const desc = String(row[col.desc] ?? '').trim()

  if (!code) { skipped.push({ line: i + 1, reason: 'no SI' }); continue }
  if (!desc) { skipped.push({ line: i + 1, reason: 'no description' }); continue }
  if (!costMatch) { skipped.push({ line: i + 1, reason: `Contract unparseable: "${contract}"` }); continue }

  const qtyRaw = String(row[col.qty] ?? '').trim()
  const defaultQty = qtyRaw !== '' ? Number(qtyRaw) : 1
  if (!Number.isFinite(defaultQty) || defaultQty < 1) {
    skipped.push({ line: i + 1, reason: `QTY unparseable: "${qtyRaw}"` })
    continue
  }

  const item = {
    network_type: network,
    item_code: code,
    description: desc,
    comments: col.comments >= 0 ? String(row[col.comments] ?? '').trim() || null : null,
    unit_cost: Number(costMatch[1]),
    default_qty: defaultQty,
    remarks: col.remarks >= 0 ? String(row[col.remarks] ?? '').trim() || null : null,
    // category/unit keep their DB defaults ('other' / 'lot') unless the
    // source file actually has a Unit column (MW.csv does).
    ...(col.unit >= 0 && String(row[col.unit] ?? '').trim()
      ? { unit: String(row[col.unit]).trim() }
      : {}),
  }
  out.push(item)
  seenCodes.set(code, (seenCodes.get(code) ?? 0) + 1)
}

const dupes = [...seenCodes.entries()].filter(([, n]) => n > 1)

if (dryRun) {
  console.log(`DRY RUN — no DB writes.`)
} else {
  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { error } = await supabase.from('catalog_items').insert(out)
  if (error) {
    console.error(`Insert failed: ${error.message}`)
    process.exit(1)
  }
}

console.log(`Imported ${out.length} rows into catalog_items (network_type = ${network}) from ${file}`)
if (skipped.length) {
  console.log(`Skipped ${skipped.length} row(s):`)
  for (const s of skipped) console.log(`  line ${s.line}: ${s.reason}`)
} else {
  console.log('Skipped 0 rows.')
}
if (dupes.length) {
  console.log(`Duplicate item_codes within ${file} (kept all rows):`)
  for (const [code, n] of dupes) console.log(`  ${code} ×${n}`)
}
if (dryRun) console.log('Re-run without --dry-run (with SUPABASE_SERVICE_ROLE_KEY set) to insert.')
