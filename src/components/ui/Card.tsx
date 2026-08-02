import { clsx } from 'clsx'
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  padding?: boolean
  hover?: boolean
  onClick?: () => void
}

export function Card({ children, className, padding = true, hover, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm',
        padding && 'p-5',
        hover && 'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 transition-all cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  )
}
