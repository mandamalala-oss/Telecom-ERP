import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  LayoutDashboard, Users, Building2, MapPin, FolderKanban, CheckSquare,
  Package, CreditCard, BarChart3, Target, Radio, X, HardHat, ClipboardCheck,
  FileText, Wrench, Truck, ShoppingCart, Award, FolderOpen, ChevronDown
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useState } from 'react'

interface NavItem {
  to: string; label: string; icon: React.ReactNode; module: string; badge?: string
}
interface NavGroup {
  label: string; items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'TELECOM OPS',
    items: [
      { to: '/telecom-dashboard', label: 'Telecom Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, module: 'dashboard' },
      { to: '/field-ops',         label: 'Field Operations',  icon: <HardHat        className="w-4 h-4" />, module: 'projects' },
      { to: '/atp',               label: 'ATP Management',    icon: <ClipboardCheck  className="w-4 h-4" />, module: 'projects' },
      { to: '/boq',               label: 'BOQ Management',    icon: <FileText        className="w-4 h-4" />, module: 'finance' },
      { to: '/assets',            label: 'Asset Traceability',icon: <Package         className="w-4 h-4" />, module: 'inventory' },
    ],
  },
  {
    label: 'WORKFORCE',
    items: [
      { to: '/resources',         label: 'Resource Mgmt',     icon: <Wrench          className="w-4 h-4" />, module: 'dashboard' },
      { to: '/procurement',       label: 'Procurement',       icon: <ShoppingCart    className="w-4 h-4" />, module: 'finance' },
      { to: '/subcontractors',    label: 'Subcontractors',    icon: <Award           className="w-4 h-4" />, module: 'dashboard' },
      { to: '/documents',         label: 'Documents (DMS)',   icon: <FolderOpen      className="w-4 h-4" />, module: 'dashboard' },
    ],
  },
  {
    label: 'CORE ERP',
    items: [
      { to: '/dashboard',  label: 'Executive Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, module: 'dashboard' },
      { to: '/crm',        label: 'CRM',                 icon: <Target          className="w-4 h-4" />, module: 'crm'       },
      { to: '/customers',  label: 'Customers',           icon: <Building2       className="w-4 h-4" />, module: 'customers' },
      { to: '/sites',      label: 'Telecom Sites',       icon: <Radio           className="w-4 h-4" />, module: 'sites'     },
      { to: '/projects',   label: 'Projects',            icon: <FolderKanban    className="w-4 h-4" />, module: 'projects'  },
      { to: '/tasks',      label: 'Task Board',          icon: <CheckSquare     className="w-4 h-4" />, module: 'tasks'     },
      { to: '/inventory',  label: 'Inventory',           icon: <Package         className="w-4 h-4" />, module: 'inventory' },
      { to: '/finance',    label: 'Finance',             icon: <CreditCard      className="w-4 h-4" />, module: 'finance'   },
      { to: '/evm',        label: 'Project Controls',    icon: <BarChart3       className="w-4 h-4" />, module: 'evm'       },
      { to: '/team',       label: 'Team',                icon: <Users           className="w-4 h-4" />, module: 'team' },
    ],
  },
]

interface SidebarProps { mobile?: boolean; onClose?: () => void }

export function Sidebar({ mobile, onClose }: SidebarProps) {
  const { can, user } = useAuth()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggle = (label: string) => setCollapsed(p => ({ ...p, [label]: !p[label] }))

  return (
    <aside className={clsx('flex flex-col bg-slate-900 h-full overflow-hidden', mobile ? 'w-72' : 'w-64')}>
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-700/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <MapPin className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight">TelecomERP</p>
            <p className="text-slate-500 text-xs">v2.0 · Network Ops</p>
          </div>
        </div>
        {mobile && onClose && (
          <button onClick={onClose} aria-label="Close menu" className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Company pill */}
      <div className="px-3 py-2.5 border-b border-slate-700/50 flex-shrink-0">
        <div className="bg-slate-800 rounded-lg px-3 py-2">
          <p className="text-slate-400 text-xs">Contractor</p>
          <p className="text-white text-sm font-bold truncate">Manonga Doria SARLU</p>
        </div>
      </div>

      {/* Nav — scrollable */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {NAV_GROUPS.map(group => {
          const allowed = group.items.filter(i => can(i.module))
          if (allowed.length === 0) return null
          const isCollapsed = collapsed[group.label]
          return (
            <div key={group.label} className="mb-2">
              <button
                onClick={() => toggle(group.label)}
                aria-expanded={!isCollapsed}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest hover:text-slate-400 transition-colors"
              >
                {group.label}
                <ChevronDown className={clsx('w-3 h-3 transition-transform', isCollapsed && '-rotate-90')} />
              </button>
              {!isCollapsed && allowed.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) => clsx('sidebar-link', isActive && 'active')}
                >
                  {item.icon}
                  <span className="flex-1 text-sm">{item.label}</span>
                  {item.badge && (
                    <span className="bg-slate-600 text-slate-200 text-xs px-1.5 py-0.5 rounded-full font-bold">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      {/* User profile */}
      {user && (
        <div className="px-3 py-3 border-t border-slate-700/50 flex-shrink-0">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-slate-800/60">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-bold truncate">{user.name.split(' ')[0]} {user.name.split(' ').slice(-1)}</p>
              <p className="text-slate-400 text-xs capitalize">{user.role} · {user.department}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
