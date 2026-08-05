import { useId, useState } from 'react'
import { clsx } from 'clsx'
import { Eye, EyeOff } from 'lucide-react'
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface LabeledProps { label?: string; error?: string }

interface RevealableProps {
  /** Show an eye toggle that reveals the value (only meaningful for type="password"). */
  revealable?: boolean
}

export function Input({ label, error, className, revealable, ...props }: InputHTMLAttributes<HTMLInputElement> & LabeledProps & RevealableProps) {
  const id = useId()
  const [revealed, setRevealed] = useState(false)
  const isPassword = props.type === 'password'
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={id} className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">{label}</label>}
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
          type={revealable && isPassword && revealed ? 'text' : props.type}
          className={clsx('input', isPassword && revealable && 'pr-10', error && 'border-red-500 focus:ring-red-500', className)}
        />
        {revealable && isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
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
