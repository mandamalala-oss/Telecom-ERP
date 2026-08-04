export interface DerivedEVM {
  cpi: number;  // EV / AC
  spi: number;  // EV / PV
  sv: number;   // EV - PV
  cv: number;   // EV - AC
  eac: number;  // BAC / CPI
  etc: number;  // EAC - AC
  vac: number;  // BAC - EAC
  tcpi: number; // (BAC - EV) / (BAC - AC)
}

/**
 * Derive the standard EVM metrics from the four base inputs. Pure and
 * unit-tested: the EVM form stores only BAC / PV / EV / AC (plus
 * percentComplete) and everything else is computed on save.
 * Division-by-zero guards return 0 (no meaningful value yet).
 */
export function deriveEVM(bac: number, pv: number, ev: number, ac: number): DerivedEVM {
  const cpi = ac > 0 ? ev / ac : 0
  const spi = pv > 0 ? ev / pv : 0
  const sv = ev - pv
  const cv = ev - ac
  const eac = cpi > 0 ? bac / cpi : 0
  const etc = eac - ac
  const vac = bac - eac
  const remainingBudget = bac - ac
  const tcpi = remainingBudget !== 0 ? (bac - ev) / remainingBudget : 0
  return { cpi, spi, sv, cv, eac, etc, vac, tcpi }
}

/**
 * EV = BAC × percentComplete / 100. The EVM form no longer takes a manual EV
 * — progress % is the input and earned value follows from the budget.
 * The percentage is clamped to 0–100 so a bad entry can't produce a negative
 * or over-100% earned value. Pure + unit-tested.
 */
export function evFromProgress(bac: number, percentComplete: number): number {
  const pct = Math.min(100, Math.max(0, percentComplete || 0))
  return Math.round((bac || 0) * (pct / 100))
}

// ─── History snapshots ───────────────────────────────────────────────────────

export interface EVMSnapshot {
  date: string;
  pv: number;
  ev: number;
  ac: number;
}

/**
 * Append a time-series snapshot to a record's `history` (JSONB array).
 * Pure + unit-tested. One snapshot per date — re-saving the same date
 * replaces that point (idempotent, lets you correct a mis-entry). Points
 * are kept in chronological order and the list is capped so the JSONB
 * column can't grow unboundedly.
 */
export function appendSnapshot(
  history: EVMSnapshot[],
  snapshot: EVMSnapshot,
  maxPoints = 100
): EVMSnapshot[] {
  const next = [...history.filter(h => h.date !== snapshot.date), snapshot]
  next.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return next.length > maxPoints ? next.slice(next.length - maxPoints) : next
}

// ─── Combination / grouping (program-level EVM) ─────────────────────────────

export interface EVMRollupInput {
  customerName?: string | null;
  po?: number;
  bac: number;
  pv: number;
  ev: number;
  ac: number;
}

export interface CombinedEVM extends DerivedEVM {
  po: number;
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  benefit: number;        // PO − AC: money received vs spent
  percentComplete: number; // ΣEV / ΣBAC × 100
}

export interface EVMCustomerRollup extends CombinedEVM {
  customerName: string;
  siteCount: number;      // number of per-site EVM records grouped here
}

/**
 * Sum PO/BAC/PV/EV/AC across records, then re-derive the standard metrics
 * from the totals (EVM is linear in these inputs, so summing is correct).
 * Pure + unit-tested; the building block for the customer rollup and for a
 * project group's combined view.
 */
export function combineEVMRecords(records: EVMRollupInput[]): CombinedEVM {
  let po = 0, bac = 0, pv = 0, ev = 0, ac = 0
  for (const r of records) {
    po += r.po ?? 0
    bac += r.bac ?? 0
    pv += r.pv ?? 0
    ev += r.ev ?? 0
    ac += r.ac ?? 0
  }
  return {
    ...deriveEVM(bac, pv, ev, ac),
    po, bac, pv, ev, ac,
    benefit: po - ac,
    percentComplete: bac > 0 ? (ev / bac) * 100 : 0,
  }
}

/**
 * Aggregate the per-site EVM records of a customer into one program-level
 * picture. Records without a customer name group under '—'.
 * Pure + unit-tested; used by the EVM module's customer rollup view.
 */
export function rollupCustomerEVM(records: EVMRollupInput[]): EVMCustomerRollup[] {
  const byCustomer = new Map<string, EVMRollupInput[]>()
  for (const r of records) {
    const name = (r.customerName ?? '').trim() || '—'
    const list = byCustomer.get(name) ?? []
    list.push(r)
    byCustomer.set(name, list)
  }
  return [...byCustomer.entries()]
    .map(([name, list]) => ({ customerName: name, siteCount: list.length, ...combineEVMRecords(list) }))
    .sort((a, b) => b.bac - a.bac)
}

// ─── Per-site records & project grouping (EVM page) ──────────────────────────

/** A single EVM record decorated with the site it belongs to (1 project = 1 site). */
export interface EVMSiteRecord extends EVMRollupInput {
  recordId: string
  projectName: string
  siteKey: string    // site code (siteId) or the project name when no site is linked
  siteName?: string
  po: number         // required: per-site rows display it
  percentComplete: number
  dataDate?: string
  history?: EVMSnapshot[]
}

export interface EVMProjectGroup {
  key: string          // `${customerName}::${projectName}`
  projectName: string
  customerName: string
  records: EVMSiteRecord[]
}

/**
 * Group per-site EVM records by project name + customer: two sites with the
 * same project name (e.g. STARLINK site A + site B) combine into one group so
 * they can be viewed together, while the per-site filter below can still
 * isolate individual sites. Pure + unit-tested.
 */
export function groupEVMByProject(records: EVMSiteRecord[]): EVMProjectGroup[] {
  const map = new Map<string, EVMProjectGroup>()
  for (const r of records) {
    const key = `${r.customerName ?? '—'}::${r.projectName}`
    let g = map.get(key)
    if (!g) {
      g = { key, projectName: r.projectName, customerName: r.customerName ?? '—', records: [] }
      map.set(key, g)
    }
    g.records.push(r)
  }
  return [...map.values()]
    .sort((a, b) => a.projectName.localeCompare(b.projectName) || a.customerName.localeCompare(b.customerName))
}

/**
 * Merge several records' history series into one: same-date snapshots are
 * summed (a combined S-curve across sites), sorted chronologically.
 * Pure + unit-tested.
 */
export function mergeHistories(records: Array<{ history?: EVMSnapshot[] }>): EVMSnapshot[] {
  const byDate = new Map<string, EVMSnapshot>()
  for (const r of records) {
    for (const h of r.history ?? []) {
      const cur = byDate.get(h.date) ?? { date: h.date, pv: 0, ev: 0, ac: 0 }
      cur.pv += h.pv ?? 0
      cur.ev += h.ev ?? 0
      cur.ac += h.ac ?? 0
      byDate.set(h.date, cur)
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}
