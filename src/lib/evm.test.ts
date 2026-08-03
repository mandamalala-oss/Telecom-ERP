import { describe, expect, it } from 'vitest'
import { deriveEVM } from '@/lib/evm'

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
