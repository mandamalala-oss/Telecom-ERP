import { Menu, Sun, Moon, LogOut } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'

interface HeaderProps {
  title: string
  onMenuClick: () => void
}

export function Header({ title, onMenuClick }: HeaderProps) {
  const { theme, toggle } = useTheme()
  const { user, logout } = useAuth()

  return (
    <header className="h-14 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center px-4 gap-4 flex-shrink-0">
      <button onClick={onMenuClick} aria-label="Open menu" className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
        <Menu className="w-5 h-5" />
      </button>

      <h1 className="text-base font-bold text-slate-900 dark:text-white flex-1 hidden sm:block">{title}</h1>

      <div className="flex items-center gap-2 ml-auto">
        {/* Theme toggle */}
        <button onClick={toggle} aria-label="Toggle theme" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500">
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Current user */}
        <div className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg bg-slate-100 dark:bg-slate-700/60">
          <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.avatar || (user?.name ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-[120px] truncate">{user?.name}</p>
            <p className="text-[10px] text-slate-400 capitalize">{user?.role}</p>
          </div>
        </div>

        <button
          onClick={() => void logout()}
          aria-label="Log out"
          title="Log out"
          className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-500"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
