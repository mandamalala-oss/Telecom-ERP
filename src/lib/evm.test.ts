import { describe, expect, it } from 'vitest'
import { appendSnapshot, deriveEVM, rollupCustomerEVM } from '@/lib/evm'

describe('deriveEVM', () => {
  it('computes all derived metrics from BAC/PV/EV/AC', () => {
    const m = deriveEVM(1000, 500, 400, 320)
    expect(m.spi).toBeCloseTo(0.8)          // 400/500
    expect(m.cpi).toBeCloseTo(1.25)         // 400/320
    expect(m.sv).toBe(-100)                 // 400-500
    expect(m.cv).toBe(80)                   // 400-320
    expect(m.eac).toBeCloseTo(800)          // 1000/1.25
    expect(m.etc).toBeCloseTo(480)          // 800-320
    expect(m.vac).toBe(200)                 // 1000-800
    expect(m.tcpi).toBeCloseTo(600 / 680)   // (1000-400)/(1000-320)
  })

  it('is on-budget/on-schedule when everything matches', () => {
    const m = deriveEVM(1000, 400, 400, 400)
    expect(m.spi).toBe(1)
    expect(m.cpi).toBe(1)
    expect(m.eac).toBe(1000)
    expect(m.vac).toBe(0)
  })

  it('guards division by zero (no data yet)', () => {
    const m = deriveEVM(0, 0, 0, 0)
    expect(m).toEqual({ cpi: 0, spi: 0, sv: 0, cv: 0, eac: 0, etc: 0, vac: 0, tcpi: 0 })
  })

  it('handles over-budget overrun', () => {
    const m = deriveEVM(1000, 500, 400, 800)
    expect(m.cpi).toBeCloseTo(0.5)
    expect(m.eac).toBeCloseTo(2000)
    expect(m.vac).toBe(-1000)
    expect(m.tcpi).toBeCloseTo(3) // (1000-400)/(1000-800): remaining work needs 3× efficiency
  })
})

describe('appendSnapshot', () => {
  it('appends a snapshot and sorts chronologically', () => {
    const next = appendSnapshot(
      [{ date: '2026-08-10', pv: 200, ev: 150, ac: 120 }],
      { date: '2026-08-01', pv: 100, ev: 80, ac: 70 }
    )
    expect(next.map(h => h.date)).toEqual(['2026-08-01', '2026-08-10'])
  })

  it('replaces the same date instead of duplicating (idempotent correction)', () => {
    const next = appendSnapshot(
      [{ date: '2026-08-01', pv: 100, ev: 80, ac: 70 }],
      { date: '2026-08-01', pv: 100, ev: 95, ac: 70 }
    )
    expect(next).toHaveLength(1)
    expect(next[0].ev).toBe(95)
  })

  it('caps the history length, keeping the most recent points', () => {
    const history = [{ date: '2026-01-01', pv: 0, ev: 0, ac: 0 }]
    let next = history
    for (let i = 1; i <= 10; i++) {
      next = appendSnapshot(next, { date: `2026-01-${String(i + 1).padStart(2, '0')}`, pv: i * 10, ev: i * 10, ac: i * 10 }, 5)
    }
    expect(next).toHaveLength(5)
    expect(next[0].date).toBe('2026-01-07') // oldest dropped, latest 5 kept
    expect(next[4].date).toBe('2026-01-11')
  })
})

describe('rollupCustomerEVM', () => {
  it('sums BAC/PV/EV/AC across a customer’s sites and re-derives the metrics', () => {
    const rollups = rollupCustomerEVM([
      // Site 1: BAC 1000, 40% done (EV 400), cost 320
      { customerName: 'Telma', bac: 1000, pv: 500, ev: 400, ac: 320 },
      // Site 2: BAC 2000, 50% done (EV 1000), cost 900
      { customerName: 'Telma', bac: 2000, pv: 1500, ev: 1000, ac: 900 },
    ])
    expect(rollups).toHaveLength(1)
    const t = rollups[0]
    expect(t.customerName).toBe('Telma')
    expect(t.siteCount).toBe(2)
    expect(t.bac).toBe(3000)
    expect(t.pv).toBe(2000)
    expect(t.ev).toBe(1400)
    expect(t.ac).toBe(1220)
    expect(t.cpi).toBeCloseTo(1400 / 1220)
    expect(t.spi).toBeCloseTo(1400 / 2000)
    expect(t.sv).toBe(-600)
    expect(t.cv).toBe(180)
    expect(t.eac).toBeCloseTo(3000 / (1400 / 1220))
    expect(t.vac).toBeCloseTo(3000 - 3000 / (1400 / 1220))
    expect(t.percentComplete).toBeCloseTo((1400 / 3000) * 100)
  })

  it('groups different customers separately and sorts by BAC descending', () => {
    const rollups = rollupCustomerEVM([
      { customerName: 'Orange', bac: 500, pv: 500, ev: 500, ac: 500 },
      { customerName: 'Telma', bac: 3000, pv: 1000, ev: 800, ac: 700 },
    ])
    expect(rollups.map(r => r.customerName)).toEqual(['Telma', 'Orange'])
  })

  it('groups records without a customer name under —', () => {
    const rollups = rollupCustomerEVM([
      { customerName: null, bac: 100, pv: 50, ev: 40, ac: 40 },
      { customerName: '', bac: 200, pv: 100, ev: 80, ac: 80 },
    ])
    expect(rollups).toHaveLength(1)
    expect(rollups[0].customerName).toBe('—')
    expect(rollups[0].siteCount).toBe(2)
    expect(rollups[0].bac).toBe(300)
  })

  it('returns an empty array for no records', () => {
    expect(rollupCustomerEVM([])).toEqual([])
  })

  it('guards division by zero when totals are zero', () => {
    const rollups = rollupCustomerEVM([
      { customerName: 'Telma', bac: 0, pv: 0, ev: 0, ac: 0 },
    ])
    expect(rollups[0].cpi).toBe(0)
    expect(rollups[0].spi).toBe(0)
    expect(rollups[0].percentComplete).toBe(0)
  })
})
