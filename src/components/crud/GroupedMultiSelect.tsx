import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'

/** One selectable option. `group` drives the dropdown heading (empty →
 * `emptyGroupLabel`). `keywords` is extra search text beyond the label. */
export interface GroupedOption {
  value: string
  label: string
  group?: string
  keywords?: string
}

interface Props {
  label?: string
  placeholder?: string
  options: GroupedOption[]
  value: string[]
  onChange: (value: string[]) => void
  /** Heading used for options with no group (default "Uncategorized"). */
  emptyGroupLabel?: string
  disabled?: boolean
}

/**
 * Reusable searchable multi-select: selected values render as removable tags,
 * the dropdown filters as you type and groups its options under headings.
 * Keyboard: ↓/↑ move, Enter toggles, Esc closes, Backspace removes the last tag.
 */
export function GroupedMultiSelect({
  label,
  placeholder = 'Search…',
  options,
  value,
  onChange,
  emptyGroupLabel = 'Uncategorized',
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const selected = useMemo(() => new Set(value), [value])
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => `${o.label} ${o.keywords ?? ''}`.toLowerCase().includes(q))
  }, [options, query])

  // Group the filtered options: named groups alphabetically, uncategorized last.
  const groups = useMemo(() => {
    const map = new Map<string, GroupedOption[]>()
    for (const o of filtered) {
      const g = (o.group ?? '').trim()
      const list = map.get(g) ?? []
      list.push(o)
      map.set(g, list)
    }
    const named = [...map.entries()]
      .filter(([g]) => g !== '')
      .sort((a, b) => a[0].localeCompare(b[0]))
    const uncategorized = map.get('')
    return uncategorized ? [...named, ['', uncategorized] as [string, GroupedOption[]]] : named
  }, [filtered])

  // Flat, ordered list backing keyboard navigation.
  const flat = useMemo(() => groups.flatMap(([, rows]) => rows), [groups])
  useEffect(() => { setHighlight(0) }, [query, open])

  const toggle = (v: string) => {
    if (disabled) return
    onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v])
  }
  const remove = (v: string) => {
    if (disabled) return
    onChange(value.filter((x) => x !== v))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setHighlight((h) => Math.min(h + 1, Math.max(0, flat.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && flat[highlight]) { e.preventDefault(); toggle(flat[highlight].value) }
      else setOpen(true)
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Backspace' && query === '' && value.length > 0) {
      remove(value[value.length - 1])
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {label && (
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">{label}</p>
      )}
      <div
        className={clsx(
          'min-h-[42px] w-full rounded-lg border bg-white dark:bg-slate-700 px-2 py-1.5 flex flex-wrap items-center gap-1.5 cursor-text',
          open ? 'border-brand-400 ring-2 ring-brand-100 dark:ring-brand-900/30' : 'border-slate-200 dark:border-slate-600',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
        onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus() } }}
      >
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-md bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 text-xs font-semibold pl-2 pr-1 py-1">
            {labelFor(v)}
            <button
              type="button"
              aria-label={`Remove ${labelFor(v)}`}
              onClick={(e) => { e.stopPropagation(); remove(v) }}
              className="rounded hover:bg-brand-100 dark:hover:bg-brand-800/50 p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-autocomplete="list"
          value={query}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-[80px] bg-transparent text-sm outline-none text-slate-900 dark:text-white placeholder:text-slate-400 py-0.5"
        />
        <ChevronDown className={clsx('w-4 h-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </div>

      {open && (
        <div role="listbox" className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-1">
          {flat.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No matches</p>}
          {groups.map(([groupName, rows]) => (
            <div key={groupName || '__none'} role="group" aria-label={groupName || emptyGroupLabel}>
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {groupName || emptyGroupLabel}
              </p>
              {rows.map((o) => {
                const isSel = selected.has(o.value)
                const isHi = flat[highlight]?.value === o.value
                return (
                  <button
                    type="button"
                    key={o.value}
                    role="option"
                    aria-selected={isSel}
                    onClick={() => toggle(o.value)}
                    className={clsx(
                      'w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2',
                      isHi ? 'bg-slate-100 dark:bg-slate-700/60' : '',
                      isSel ? 'text-brand-700 dark:text-brand-300 font-semibold' : 'text-slate-700 dark:text-slate-200',
                    )}
                  >
                    <span className="truncate">{o.label}</span>
                    {isSel && <span aria-hidden className="text-brand-500">✓</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
