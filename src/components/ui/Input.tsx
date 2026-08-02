import { useId } from 'react'
import { clsx } from 'clsx'
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface LabeledProps { label?: string; error?: string }

export function Input({ label, error, className, ...props }: InputHTMLAttributes<HTMLInputElement> & LabeledProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={id} className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">{label}</label>}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
        className={clsx('input', error && 'border-red-500 focus:ring-red-500', className)}
      />
      {error && <p id={`${id}-error`} className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function Select({ label, error, className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & LabeledProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={id} className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">{label}</label>}
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
        className={clsx('select', error && 'border-red-500', className)}
      >
        {children}
      </select>
      {error && <p id={`${id}-error`} className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

export function Textarea({ label, error, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & LabeledProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={id} className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">{label}</label>}
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
        rows={props.rows ?? 3}
        className={clsx('input resize-none', error && 'border-red-500', className)}
      />
      {error && <p id={`${id}-error`} className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
