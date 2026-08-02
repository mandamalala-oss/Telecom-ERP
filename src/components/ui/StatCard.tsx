import { clsx } from 'clsx'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  icon: string
  color: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'cyan'
  subtitle?: string
}

const colors = {
  blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20',   icon: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' },
  green:  { bg: 'bg-green-50 dark:bg-green-900/20', icon: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400' },
  amber:  { bg: 'bg-amber-50 dark:bg-amber-900/20', icon: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' },
  red:    { bg: 'bg-red-50 dark:bg-red-900/20',     icon: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20',icon: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400' },
  cyan:   { bg: 'bg-cyan-50 dark:bg-cyan-900/20',   icon: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400' },
}

export function StatCard({ label, value, change, changeLabel, icon, color, subtitle }: StatCardProps) {
  const c = colors[color]
  // A NaN/absent change must never render as "NaN%" with a red arrow.
  const isFiniteChange = typeof change === 'number' && Number.isFinite(change)
  const isPositive = isFiniteChange && change > 0
  const isNeutral = !isFiniteChange || change === 0
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white truncate">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          {isFiniteChange && (
            <div className={clsx('flex items-center gap-1 mt-1.5 text-xs font-semibold', isPositive ? 'text-green-600 dark:text-green-400' : isNeutral ? 'text-slate-500' : 'text-red-600 dark:text-red-400')}>
              {isNeutral ? <Minus className="w-3 h-3" /> : isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {`${isPositive ? '+' : ''}${change}%`}
              {changeLabel && <span className="text-slate-400 font-normal ml-0.5">{changeLabel}</span>}
            </div>
          )}
        </div>
        <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0', c.icon)}>{icon}</div>
      </div>
    </div>
  )
}
