import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider }  from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { Layout }        from '@/components/layout/Layout'

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

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/telecom-dashboard" replace />} />
              {/* V2 - Primary */}
              <Route path="telecom-dashboard" element={<TelecomDashboard />} />
              <Route path="field-ops"         element={<FieldOpsModule />} />
              <Route path="atp"               element={<ATPModule />} />
              <Route path="boq"               element={<BOQModule />} />
              <Route path="assets"            element={<AssetModule />} />
              <Route path="resources"         element={<ResourceModule />} />
              <Route path="procurement"       element={<ProcurementModule />} />
              <Route path="subcontractors"    element={<SubcontractorModule />} />
              <Route path="documents"         element={<DocumentModule />} />
              {/* V1 */}
              <Route path="dashboard"  element={<ExecutiveDashboard />} />
              <Route path="crm"        element={<CRMModule />} />
              <Route path="customers"  element={<CustomersModule />} />
              <Route path="sites"      element={<SitesModule />} />
              <Route path="projects"   element={<ProjectsModule />} />
              <Route path="tasks"      element={<KanbanBoard />} />
              <Route path="inventory"  element={<InventoryModule />} />
              <Route path="finance"    element={<FinanceModule />} />
              <Route path="evm"        element={<EVMModule />} />
              <Route path="team"       element={<TeamModule />} />
              <Route path="*"          element={<Navigate to="/telecom-dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
