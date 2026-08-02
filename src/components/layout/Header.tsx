import { Menu, Sun, Moon, ChevronDown } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useEffect, useRef, useState } from 'react'

interface HeaderProps {
  title: string
  onMenuClick: () => void
}

export function Header({ title, onMenuClick }: HeaderProps) {
  const { theme, toggle } = useTheme()
  const { user, users, switchUser } = useAuth()
  const [showSwitcher, setShowSwitcher] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)

  // Close the user switcher on outside click or Escape.
  useEffect(() => {
    if (!showSwitcher) return
    const onDocClick = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setShowSwitcher(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowSwitcher(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [showSwitcher])

  return (
    <header className="h-14 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center px-4 gap-4 flex-shrink-0">
      <button onClick={onMenuClick} aria-label="Open menu" className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
        <Menu className="w-5 h-5" />
      </button>

      <h1 className="text-base font-bold text-slate-900 dark:text-white flex-1 hidden sm:block">{title}</h1>

      <div className="flex items-center gap-1 ml-auto">
        {/* Theme toggle */}
        <button onClick={toggle} aria-label="Toggle theme" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* User switcher (demo) */}
        <div ref={switcherRef} className="relative">
          <button
            onClick={() => setShowSwitcher(v => !v)}
            aria-haspopup="menu"
            aria-expanded={showSwitcher}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold">
              {user?.avatar}
            </div>
            <span className="hidden sm:block text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-[100px] truncate">
              {user?.name.split(' ')[0]}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showSwitcher && (
            <div role="menu" className="absolute right-0 top-full mt-1 w-64 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg z-50">
              <p className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 dark:border-slate-700">
                Switch User (Demo)
              </p>
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => { switchUser(u.id); setShowSwitcher(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {u.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{u.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{u.role} — {u.department}</p>
                  </div>
                  {user?.id === u.id && <div className="ml-auto w-2 h-2 rounded-full bg-green-500" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
