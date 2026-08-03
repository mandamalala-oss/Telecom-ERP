import { describe, expect, it } from 'vitest'
import { projectFinance } from '@/lib/projectFinance'

describe('projectFinance', () => {
  it('computes variance = budget - spent and profit = revenue - spent', () => {
    const f = projectFinance(1000, 400, 700)
    expect(f.variance).toBe(600)
    expect(f.profit).toBe(300)
    expect(f.spentPct).toBe(40)
  })

  it('is green while spent is under 80% of budget', () => {
    expect(projectFinance(1000, 0, 0).varianceColor).toBe('text-green-600')
    expect(projectFinance(1000, 799, 0).varianceColor).toBe('text-green-600')
  })

  it('is orange when spent is 80-100% of budget (approaching the limit)', () => {
    expect(projectFinance(1000, 800, 0).varianceColor).toBe('text-orange-500') // exactly 80%
    expect(projectFinance(1000, 900, 0).varianceColor).toBe('text-orange-500')
    expect(projectFinance(1000, 1000, 0).varianceColor).toBe('text-orange-500') // exactly 100%
  })

  it('is red when spent exceeds budget (variance < 0)', () => {
    expect(projectFinance(1000, 1001, 0).varianceColor).toBe('text-red-600')
    expect(projectFinance(1000, 1500, 0).variance).toBe(-500)
    expect(projectFinance(1000, 1500, 0).varianceColor).toBe('text-red-600')
  })

  it('treats spent without any budget as over budget (red)', () => {
    expect(projectFinance(0, 10, 0).spentPct).toBe(101)
    expect(projectFinance(0, 10, 0).varianceColor).toBe('text-red-600')
  })

  it('treats zero budget and zero spent as on track (green)', () => {
    const f = projectFinance(0, 0, 0)
    expect(f.spentPct).toBe(0)
    expect(f.varianceColor).toBe('text-green-600')
  })

  it('colors profit green when >= 0 and red when negative', () => {
    expect(projectFinance(1000, 400, 700).profitColor).toBe('text-green-600')
    expect(projectFinance(1000, 400, 700).profit).toBe(300)
    expect(projectFinance(1000, 500, 400).profitColor).toBe('text-red-600')
    expect(projectFinance(1000, 500, 400).profit).toBe(-100)
  })

  it('defaults missing values to 0', () => {
    const f = projectFinance()
    expect(f).toEqual({ variance: 0, spentPct: 0, varianceColor: 'text-green-600', profit: 0, profitColor: 'text-green-600' })
  })
})
