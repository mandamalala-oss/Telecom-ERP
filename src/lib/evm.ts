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

// ─── Customer rollup (program-level EVM) ─────────────────────────────────────

export interface EVMRollupInput {
  customerName?: string | null;
  po?: number;
  bac: number;
  pv: number;
  ev: number;
  ac: number;
}

export interface EVMCustomerRollup extends DerivedEVM {
  customerName: string;
  siteCount: number;      // number of per-site EVM records grouped here
  po: number;             // customer PO summed across the sites
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  benefit: number;        // PO − AC: money received vs spent
  percentComplete: number; // ΣEV / ΣBAC × 100
}

/**
 * Aggregate the per-site EVM records of a customer into one program-level
 * picture: BAC/PV/EV/AC are summed, then the standard metrics are re-derived
 * from the totals (EVM is linear in these inputs, so summing is correct).
 * Pure + unit-tested; used by the EVM module's customer rollup view.
 * Records without a customer name group under '—'.
 */
export function rollupCustomerEVM(records: EVMRollupInput[]): EVMCustomerRollup[] {
  const acc = new Map<string, EVMCustomerRollup>()
  for (const r of records) {
    const name = (r.customerName ?? '').trim() || '—'
    let rollup = acc.get(name)
    if (!rollup) {
      rollup = {
        customerName: name, siteCount: 0,
        po: 0, bac: 0, pv: 0, ev: 0, ac: 0,
        benefit: 0, percentComplete: 0,
        cpi: 0, spi: 0, sv: 0, cv: 0, eac: 0, etc: 0, vac: 0, tcpi: 0,
      }
      acc.set(name, rollup)
    }
    rollup.siteCount += 1
    rollup.po += r.po ?? 0
    rollup.bac += r.bac ?? 0
    rollup.pv += r.pv ?? 0
    rollup.ev += r.ev ?? 0
    rollup.ac += r.ac ?? 0
  }
  const result = [...acc.values()]
  for (const rollup of result) {
    Object.assign(rollup, deriveEVM(rollup.bac, rollup.pv, rollup.ev, rollup.ac))
    rollup.benefit = rollup.po - rollup.ac
    rollup.percentComplete = rollup.bac > 0 ? (rollup.ev / rollup.bac) * 100 : 0
  }
  result.sort((a, b) => b.bac - a.bac)
  return result
}
