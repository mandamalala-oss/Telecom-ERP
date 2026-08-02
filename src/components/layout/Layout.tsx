import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

const TITLES: Record<string, string> = {
  '/telecom-dashboard': '📡 Telecom Executive Dashboard',
  '/field-ops':         '🏗️ Field Operations',
  '/atp':               '✅ ATP Management',
  '/boq':               '💰 BOQ Management',
  '/assets':            '📦 Asset Traceability',
  '/resources':         '👷 Resource Management',
  '/procurement':       '🛒 Procurement',
  '/subcontractors':    '🏢 Subcontractor Management',
  '/documents':         '📁 Document Management',
  '/dashboard':         '⊞ Executive Dashboard',
  '/crm':               '🎯 CRM — Leads & Pipeline',
  '/customers':         '🏢 Customers',
  '/sites':             '📡 Telecom Sites',
  '/projects':          '📁 Projects',
  '/tasks':             '✅ Task Board',
  '/inventory':         '📦 Inventory',
  '/finance':           '💳 Finance',
  '/evm':               '📊 Project Controls — EVM',
  '/team':              '👥 Team',
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const title = TITLES[location.pathname] ?? 'TelecomERP'

  // Close the mobile drawer with Escape.
  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sidebarOpen])

  // Close the drawer when navigating to a new route.
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-col flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile overlay sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
          <div className="relative z-10"><Sidebar mobile onClose={() => setSidebarOpen(false)} /></div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
