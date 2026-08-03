export interface ProjectFinance {
  /** Budget − Spent (Ar) */
  variance: number
  /** Spent as % of Budget (101 means over budget with budget=0) */
  spentPct: number
  /** Tailwind text color for the variance: red >100% spent, orange 80–100%, green <80% */
  varianceColor: string
  /** Revenue − Spent (Ar) */
  profit: number
  /** Tailwind text color for the profit: green ≥ 0, red < 0 */
  profitColor: string
}

/**
 * Project financial KPIs (pure, unit-tested). Traffic light on budget
 * consumption:
 * - red    spent > 100% of budget   (variance < 0)
 * - orange spent 80–100% of budget   (approaching the limit)
 * - green  spent < 80% of budget
 */
export function projectFinance(budget?: number, spent?: number, revenue?: number): ProjectFinance {
  const b = budget ?? 0
  const s = spent ?? 0
  const r = revenue ?? 0
  const variance = b - s
  const spentPct = b > 0 ? (s / b) * 100 : (s > 0 ? 101 : 0)
  const varianceColor = spentPct > 100 ? 'text-red-600' : spentPct >= 80 ? 'text-orange-500' : 'text-green-600'
  const profit = r - s
  const profitColor = profit >= 0 ? 'text-green-600' : 'text-red-600'
  return { variance, spentPct, varianceColor, profit, profitColor }
}
