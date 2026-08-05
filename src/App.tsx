import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { ReactElement } from 'react'
import { AuthProvider, useAuth, firstAllowedPath } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { Layout }        from '@/components/layout/Layout'
import { LoginPage }     from '@/components/auth/LoginPage'
import { ConfirmPage }   from '@/components/auth/ConfirmPage'

// V1 Modules
import { ExecutiveDashboard } from '@/modules/dashboards/ExecutiveDashboard'
import { CRMModule }          from '@/modules/crm/CRMModule'
import { CustomersModule }    from '@/modules/customers/CustomersModule'
import { SitesModule }        from '@/modules/sites/SitesModule'
import { ProjectsModule }     from '@/modules/projects/ProjectsModule'
import { KanbanBoard }        from '@/modules/tasks/KanbanBoard'
import { InventoryModule }    from '@/modules/inventory/InventoryModule'
import { FinanceModule }      from '@/modules/financial/FinanceModule'
import { EVMModule }          from '@/modules/controls/EVMModule'
import { TeamModule }         from '@/modules/team/TeamModule'

// V2 Modules
import { TelecomDashboard }      from '@/modules/exec-dashboard/TelecomDashboard'
import { FieldOpsModule }        from '@/modules/field-ops/FieldOpsModule'
import { ATPModule }             from '@/modules/atp/ATPModule'
import { BOQModule }             from '@/modules/boq/BOQModule'
import { AssetModule }           from '@/modules/assets/AssetModule'
import { ResourceModule }        from '@/modules/resources/ResourceModule'
import { ProcurementModule }     from '@/modules/procurement/ProcurementModule'
import { SubcontractorModule }   from '@/modules/subcontractors/SubcontractorModule'
import { DocumentModule }        from '@/modules/dms/DocumentModule'

/** Blocks everything behind a real Supabase session. */
function RequireAuth({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="h-screen flex items-center justify-center text-sm text-slate-400">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

/** Route-level module guard — mirrors the Sidebar's module keys. */
function RequireModule({ module, children }: { module: string; children: ReactElement }) {
  const { can } = useAuth()
  if (!can(module)) return <Navigate to={firstAllowedPath(can)} replace />
  return children
}

const guard = (module: string, el: ReactElement) => <RequireModule module={module}>{el}</RequireModule>

/**
 * Landing page: first granted module, or a "no access" screen when the CEO
 * hasn't granted anything yet (avoids the /login redirect loop).
 */
function Home() {
  const { can, logout } = useAuth()
  const path = firstAllowedPath(can)
  if (path !== '/') return <Navigate to={path} replace />
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-3 bg-slate-900">
      <p className="text-slate-300 text-sm">No modules have been granted to your account yet.</p>
      <p className="text-slate-500 text-xs">Ask the administrator (CEO) to grant you access in the Team module.</p>
      <button
        onClick={() => void logout()}
        className="mt-2 text-xs font-semibold text-brand-400 hover:underline"
      >
        Sign out
      </button>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/confirm" element={<ConfirmPage />} />
            <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Home />} />
              {/* V2 - Primary (module keys mirror Sidebar) */}
              <Route path="telecom-dashboard" element={guard('dashboard', <TelecomDashboard />)} />
              <Route path="field-ops"         element={guard('projects', <FieldOpsModule />)} />
              <Route path="atp"               element={guard('projects', <ATPModule />)} />
              <Route path="boq"               element={guard('finance', <BOQModule />)} />
              <Route path="assets"            element={guard('inventory', <AssetModule />)} />
              <Route path="resources"         element={guard('dashboard', <ResourceModule />)} />
              <Route path="procurement"       element={guard('finance', <ProcurementModule />)} />
              <Route path="subcontractors"    element={guard('dashboard', <SubcontractorModule />)} />
              <Route path="documents"         element={guard('dashboard', <DocumentModule />)} />
              {/* V1 */}
              <Route path="dashboard"  element={guard('dashboard', <ExecutiveDashboard />)} />
              <Route path="crm"        element={guard('crm', <CRMModule />)} />
              <Route path="customers"  element={guard('customers', <CustomersModule />)} />
              <Route path="sites"      element={guard('sites', <SitesModule />)} />
              <Route path="projects"   element={guard('projects', <ProjectsModule />)} />
              <Route path="tasks"      element={guard('tasks', <KanbanBoard />)} />
              <Route path="inventory"  element={guard('inventory', <InventoryModule />)} />
              <Route path="finance"    element={guard('finance', <FinanceModule />)} />
              <Route path="evm"        element={guard('evm', <EVMModule />)} />
              <Route path="team"       element={guard('team', <TeamModule />)} />
              <Route path="*"          element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
