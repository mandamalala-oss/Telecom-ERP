import type { FieldConfig, LineColumn } from '@/components/crud/EntityFormModal'
import { DEPARTMENTS } from '@/types'

// Table names, keyed by the same short name used across the app/modules.
export const TABLES = {
  users: 'users',
  leads: 'leads',
  opportunities: 'opportunities',
  companies: 'companies',
  contacts: 'contacts',
  sites: 'sites',
  projects: 'projects',
  projectSites: 'project_sites',
  projectSupplyItems: 'project_supply_items',
  tasks: 'tasks',
  warehouses: 'warehouses',
  inventoryItems: 'inventory_items',
  stockMovements: 'stock_movements',
  quotes: 'quotes',
  invoices: 'invoices',
  purchaseOrders: 'purchase_orders',
  payments: 'payments',
  evmMetrics: 'evm_metrics',
  surveyReports: 'survey_reports',
  installationRecords: 'installation_records',
  integrationRecords: 'integration_records',
  atpTemplates: 'atp_templates',
  atpRecords: 'atp_records',
  acceptanceCertificates: 'acceptance_certificates',
  paymentSchedules: 'payment_schedules',
  projectPaymentMilestones: 'project_payment_milestones',
  boqs: 'boqs',
  catalogItems: 'catalog_items',
  assets: 'assets',
  employees: 'employees',
  vehicles: 'vehicles',
  tools: 'tools',
  purchaseRequests: 'purchase_requests',
  subcontractors: 'subcontractors',
  documents: 'documents',
  contracts: 'contracts',
} as const

// Table → permission-module key, mirroring the route guards in App.tsx.
// useEntityCrud consults this to gate New/Edit/Delete behind the member's
// module grant (set by the CEO in the Team permission matrix).
// Tables absent from this map are NOT gated (e.g. junction rows).
export const TABLE_MODULE: Record<string, string> = {
  users: 'team', // Team page is guarded by 'team'
  leads: 'crm',
  opportunities: 'crm',
  companies: 'customers',
  contacts: 'customers',
  sites: 'sites',
  projects: 'projects',
  tasks: 'tasks',
  warehouses: 'inventory',
  inventoryItems: 'inventory',
  stockMovements: 'inventory',
  quotes: 'finance',
  invoices: 'finance',
  purchaseOrders: 'finance',
  payments: 'finance',
  evmMetrics: 'evm',
  surveyReports: 'projects', // Field Ops is guarded by 'projects'
  installationRecords: 'projects',
  integrationRecords: 'projects',
  atpTemplates: 'projects', // ATP is guarded by 'projects'
  atpRecords: 'projects',
  acceptanceCertificates: 'projects', // PAC/FAC live inside the ATP module
  paymentSchedules: 'finance', // milestone billing templates
  projectPaymentMilestones: 'finance',
  boqs: 'finance', // BOQ is guarded by 'finance'
  assets: 'inventory',
  employees: 'dashboard', // Resources is guarded by 'dashboard'
  vehicles: 'dashboard',
  tools: 'dashboard',
  purchaseRequests: 'finance', // Procurement is guarded by 'finance'
  subcontractors: 'dashboard', // Subcontractors is guarded by 'dashboard'
  documents: 'dashboard', // Documents is guarded by 'dashboard'
}

const REGIONS = ['Antsiranana', 'Diana', 'Sava', 'Analanjirofo', 'Sofia', 'Boeny', 'Melaky', 'Betsiboka', 'Alaotra-Mangoro', 'Analamanga', 'Vakinankaratra', 'Bongolava', 'Itasy', 'Atsimo-Atsinanana', 'Atsinanana', 'Vatovavy-Fitovinany', 'Amoron’i Mania', 'Haute Matsiatra', 'Ihorombe', 'Androy', 'Anosy', 'Menabe']
const TECHS = ['2G', '3G', '4G', '4G+', '5G', 'MW', 'VSAT']
const DISH_SIZES = ['0.3m', '0.6m', '0.9m', '1.2m', '1.8m', '2.4m', '3m']
const RAN_ITEMS = ['ANTENNA', 'RRU', 'FO', 'RACK', 'BASEBAND']
const MOD_RAN_ITEMS = ['RRU', 'ANTENNA', 'RACK', 'BASEBAND']

// Scope of Work: sub-fields appear only once BOTH selectors have a value
// (EntityFormModal hides them via showWhen and prunes stale values on switch).
const scopeIs = (buildType: string, technology: string) => (v: Record<string, any>) =>
  v.scopeBuildType === buildType && v.scopeTechnology === technology

// ─── BOQ line items ─────────────────────────────────────────────────────────
const BOQ_LINE_COLUMNS: LineColumn[] = [
  { key: 'itemCode', label: 'Code', span: 1 },
  { key: 'description', label: 'Description', span: 3 },
  { key: 'category', label: 'Category', span: 2, type: 'select', options: ['civil', 'supply', 'installation', 'integration', 'testing', 'pm', 'hse', 'other'] },
  { key: 'unit', label: 'Unit', span: 1 },
  { key: 'quantity', label: 'Qty', span: 1, type: 'number' },
  { key: 'unitCost', label: 'Unit Cost', span: 2, type: 'number' },
]

// BOQ totals are DERIVED from the line items + contingency % — the form
// fields for subtotal/contingency/grandTotal are kept in sync automatically.
const boqDerive = (v: Record<string, any>) => {
  const subtotal = (v.items ?? []).reduce((s: number, i: any) => s + (Number(i.totalCost) || 0), 0)
  const pct = Number(v.contingencyPct) || 0
  const contingency = Math.round((subtotal * pct) / 100)
  return { subtotal, contingency, grandTotal: subtotal + contingency }
}

// ─── Field-op crew + vehicle ────────────────────────────────────────────────
// A field operation (survey/installation/integration) picks a crew of up to
// four people (1 Team Leader, 1 Technician, 1 Rigger, 1 Driver — each
// optional) and one vehicle, all selected from Resource Mgmt. `filter`
// scopes each dropdown to the matching role.
const employeeLookup = (key: string, role: string, label: string): FieldConfig => ({
  key: `${key}Id`,
  label,
  type: 'select',
  lookup: {
    table: 'employees', valueKey: 'id', labelKey: 'name',
    labelFormat: '{name} ({role})', orderBy: 'name',
    filter: (r: any) => r.role === role,
  },
})
const FIELD_CREW: FieldConfig[] = [
  employeeLookup('teamLeader', 'Team Leader', 'Team Leader'),
  employeeLookup('technician', 'Technician', 'Technician'),
  employeeLookup('rigger', 'Rigger', 'Rigger'),
  employeeLookup('driver', 'Driver', 'Driver'),
  {
    key: 'vehicleId', label: 'Vehicle', type: 'select',
    lookup: { table: 'vehicles', valueKey: 'id', labelKey: 'registration', labelFormat: '{registration} — {make} {model}', orderBy: 'registration' },
  },
]
const FIELD_PROJECT: FieldConfig = { key: 'projectName', label: 'Project', type: 'select', lookup: { table: 'projects', valueKey: 'name', labelKey: 'name', populate: { projectId: 'id' } } }

// Project Manager: chosen from Resource Mgmt — department 'Project' + role
// 'Manager' (the only people eligible to run a project / field operation).
const PROJECT_MANAGER_FIELD: FieldConfig = {
  key: 'projectManagerId', label: 'Project Manager', type: 'select',
  lookup: {
    table: 'employees', valueKey: 'id', labelKey: 'name',
    labelFormat: '{name} ({department})', orderBy: 'name',
    filter: (r: any) => r.role === 'Manager' && r.department === 'Project',
  },
}

export const FIELD_CONFIGS: Record<string, FieldConfig[]> = {
  leads: [
    { key: 'company', label: 'Company', type: 'select', required: true, lookup: { table: 'companies', valueKey: 'name', labelKey: 'name' } },
    { key: 'contact', label: 'Contact', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: ['new', 'contacted', 'qualified', 'unqualified'] },
    { key: 'source', label: 'Source', type: 'select', options: ['referral', 'tender', 'cold_call', 'website', 'partner'] },
    { key: 'value', label: 'Value (Ar)', type: 'number' },
    { key: 'assignedTo', label: 'Assigned To', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  opportunities: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'customerName', label: 'Customer', type: 'select', lookup: { table: 'companies', valueKey: 'name', labelKey: 'name', populate: { customerId: 'id' } } },
    { key: 'stage', label: 'Stage', type: 'select', options: ['prospecting', 'proposal', 'negotiation', 'closed_won', 'closed_lost'] },
    { key: 'value', label: 'Value (Ar)', type: 'number' },
    { key: 'probability', label: 'Probability %', type: 'number' },
    { key: 'expectedClose', label: 'Expected Close', type: 'date' },
    { key: 'assignedTo', label: 'Assigned To', type: 'text' },
    { key: 'technologies', label: 'Technologies', type: 'tags', placeholder: '4G, 5G' },
    { key: 'siteCount', label: 'Site Count', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  companies: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'type', label: 'Type', type: 'select', options: ['telecom_operator', 'tower_company', 'vendor', 'subcontractor', 'government'] },
    // Vendor drives the site grouping in the Project form's site combobox.
    { key: 'vendor', label: 'Vendor', type: 'select', options: ['Nokia', 'Huawei', 'other'] },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'address', label: 'Address', type: 'text' },
    { key: 'website', label: 'Website', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: ['active', 'inactive'] },
  ],
  contacts: [
    { key: 'companyName', label: 'Company', type: 'select', lookup: { table: 'companies', valueKey: 'name', labelKey: 'name', populate: { companyId: 'id' } } },
    { key: 'firstName', label: 'First Name', type: 'text', required: true },
    { key: 'lastName', label: 'Last Name', type: 'text' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'isPrimary', label: 'Primary Contact', type: 'checkbox' },
  ],
  sites: [
    { key: 'siteId', label: 'Site ID', type: 'text', required: true, placeholder: 'MDG-TAN-001' },
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'region', label: 'Region', type: 'select', options: REGIONS },
    // A site MUST belong to a customer; its vendor is inherited through this
    // link (companies.vendor), never stored on the site row.
    { key: 'customerName', label: 'Customer', type: 'select', required: true, lookup: { table: 'companies', valueKey: 'name', labelKey: 'name', populate: { customerId: 'id' } } },
    { key: 'latitude', label: 'Latitude', type: 'number' },
    { key: 'longitude', label: 'Longitude', type: 'number' },
    { key: 'technology', label: 'Technology', type: 'multiSelect', options: ['2G', '3G', '4G', '5G'] },
    { key: 'transmissionType', label: 'Transmission Type', type: 'select', options: ['MW', 'VSAT', 'STARLINK', 'OF'] },
    { key: 'status', label: 'Status', type: 'select', options: ['planned', 'survey', 'installation', 'integration', 'atp', 'acceptance', 'live', 'decommissioned'] },
    { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'critical'] },
    { key: 'towerType', label: 'Tower Type', type: 'select', options: ['greenfield', 'rooftop', 'mast', 'shared_tower'] },
    { key: 'powerSource', label: 'Power Source', type: 'select', options: ['grid', 'generator', 'solar', 'hybrid'] },
    { key: 'accessType', label: 'Access Type', type: 'select', options: ['road', 'offroad', 'boat'] },
    { key: 'meansOfTransport', label: 'Means of Transport', type: 'multiSelect', options: ['4x4', 'moto', 'boat', 'foot'] },
    { key: 'transportLengthKm', label: 'Transport Length (km)', type: 'number' },
    { key: 'walkDistanceKm', label: 'Walk from 4x4 End (km)', type: 'number' },
    { key: 'distanceKm', label: 'Distance (km)', type: 'number' },
    { key: 'revenue', label: 'Revenue (Ar)', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  projects: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    // Searchable multi-select, grouped by the site's customer vendor. The
    // vendor is resolved through companies (site.customerId → companies.id),
    // never duplicated onto the site row.
    { key: 'siteIds', label: 'Sites', type: 'multiSelect', virtual: true,
      lookup: { table: 'sites', valueKey: 'id', labelKey: 'name', labelFormat: '{siteId} — {name}', orderBy: 'siteId' },
      groupBy: { table: 'companies', keyField: 'customerId', groupKey: 'id', groupLabel: 'vendor' } },
    { key: 'customerName', label: 'Customer', type: 'select', lookup: { table: 'companies', valueKey: 'name', labelKey: 'name', populate: { customerId: 'id' } } },
    { key: 'status', label: 'Status', type: 'select', options: ['not_started', 'in_progress', 'on_hold', 'completed', 'cancelled'] },
    { key: 'currentPhase', label: 'Current Phase', type: 'select', options: ['survey', 'installation', 'integration', 'atp', 'acceptance'] },
    { key: 'startDate', label: 'Start Date', type: 'date' },
    { key: 'endDate', label: 'End Date', type: 'date' },
    { key: 'budget', label: 'BAC (Ar)', type: 'number' },
    { key: 'spent', label: 'AC — Actual Cost (Ar)', type: 'number' },
    { key: 'revenue', label: 'PO (Ar)', type: 'number' },
    // Milestone billing template: applying one generates the project's
    // payment-milestone ledger (and the advance invoice, if any).
    { key: 'paymentScheduleId', label: 'Payment Schedule', type: 'select', section: 'Payment Schedule',
      lookup: { table: 'payment_schedules', valueKey: 'id', labelKey: 'name', orderBy: 'name', populate: { paymentScheduleName: 'name' } } },
    { key: 'pm', label: 'Project Manager', type: 'select', lookup: { table: 'employees', valueKey: 'name', labelKey: 'name', labelFormat: '{name} ({department})', orderBy: 'name', filter: (r: any) => r.role === 'Manager' && r.department === 'Project' } },
    { key: 'progress', label: 'Progress %', type: 'number' },
    { key: 'region', label: 'Region', type: 'select', options: REGIONS },
    // ── Scope of Work (telecom site projects) ────────────────────────────────
    // Build Type + Technology gate the sub-fields; nothing renders until both
    // are chosen, and switching either clears the now-irrelevant sub-values.
    { key: 'scopeBuildType', label: 'Build Type', type: 'select', options: ['NSB', 'MOD'], section: 'Scope of Work' },
    { key: 'scopeTechnology', label: 'Technology', type: 'select', options: ['RAN', 'MW'] },
    { key: 'scopeNsbRanItems', label: 'Scope Items', type: 'multiSelect', options: RAN_ITEMS, showWhen: scopeIs('NSB', 'RAN') },
    { key: 'scopeNsbMwDishSize', label: 'Dish Size', type: 'select', chips: true, options: DISH_SIZES, showWhen: scopeIs('NSB', 'MW') },
    { key: 'scopeModRanAddItems', label: 'ADD Items', type: 'multiSelect', options: MOD_RAN_ITEMS, showWhen: scopeIs('MOD', 'RAN') },
    { key: 'scopeModRanSwapItems', label: 'SWAP Items', type: 'multiSelect', options: MOD_RAN_ITEMS, showWhen: scopeIs('MOD', 'RAN') },
    { key: 'scopeModMwSwapDishSize', label: 'Dish Size — SWAP', type: 'select', chips: true, options: DISH_SIZES, showWhen: scopeIs('MOD', 'MW') },
  ],
  // Junction table — internal only (no module in the sidebar). Config exists
  // so the schema↔config invariant holds and lookups can reference it.
  project_sites: [
    { key: 'projectId', label: 'Project', type: 'select', lookup: { table: 'projects', valueKey: 'name', labelKey: 'name' } },
    { key: 'siteId', label: 'Site', type: 'select', lookup: { table: 'sites', valueKey: 'id', labelKey: 'name', labelFormat: '{siteId} — {name}' } },
  ],
  // Goods lines for supply/trading projects — edited via the custom supply
  // modal in ProjectsModule, not the generic form. Config exists so the
  // schema↔config invariant holds.
  project_supply_items: [
    { key: 'projectId', label: 'Project', type: 'select', lookup: { table: 'projects', valueKey: 'name', labelKey: 'name' } },
    { key: 'code', label: 'Code', type: 'text' },
    { key: 'description', label: 'Description', type: 'text', required: true },
    { key: 'unit', label: 'Unit', type: 'text' },
    { key: 'qty', label: 'Qty', type: 'number' },
    { key: 'purchasePrice', label: 'Purchase Price', type: 'number' },
    { key: 'sellingPrice', label: 'Selling Price', type: 'number' },
  ],
  tasks: [
    { key: 'title', label: 'Title', type: 'text', required: true },
    { key: 'projectName', label: 'Project', type: 'select', lookup: { table: 'projects', valueKey: 'name', labelKey: 'name', populate: { projectId: 'id' } } },
    { key: 'siteId', label: 'Site', type: 'select', clearOnChangeOf: 'projectName',
      lookup: { table: 'sites', valueKey: 'id', labelKey: 'name', labelFormat: '{siteId} — {name}', orderBy: 'siteId',
        filter: (site, values, options) => {
          const junction = (options?.['project_sites'] ?? []) as any[]
          const projectId = values?.projectId
          if (!projectId) return false
          return junction.some((ps) => ps.projectId === projectId && ps.siteId === site.id)
        } } },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'status', label: 'Status', type: 'select', options: ['backlog', 'todo', 'in_progress', 'review', 'done'] },
    { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'critical'] },
    { key: 'assigneeId', label: 'Assignee', type: 'select', lookup: { table: 'users', valueKey: 'id', labelKey: 'name', orderBy: 'name', populate: { assigneeName: 'name' } } },
    { key: 'startDate', label: 'Start Date', type: 'date',
      validate: (v) => (v.startDate && v.dueDate && v.startDate > v.dueDate
        ? 'Start date cannot be after the due date' : null) },
    { key: 'dueDate', label: 'Due Date', type: 'date' },
    { key: 'isMilestone', label: 'Milestone', type: 'checkbox' },
    { key: 'estimatedHours', label: 'Estimated Hours', type: 'number', showWhen: (v) => !v.isMilestone },
    { key: 'loggedHours', label: 'Logged Hours', type: 'number' },
    { key: 'phase', label: 'Phase', type: 'select', options: ['survey', 'installation', 'integration', 'atp', 'acceptance'] },
    { key: 'dependencies', label: 'Dependencies', type: 'multiSelect', lookup: { table: 'tasks', valueKey: 'id', labelKey: 'title', orderBy: 'title', filter: (row, values) => row.projectId === values?.projectId && row.id !== values?.id } },
    { key: 'tags', label: 'Tags', type: 'tags' },
  ],
  warehouses: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'manager', label: 'Manager', type: 'text' },
  ],
  inventory_items: [
    { key: 'sku', label: 'SKU', type: 'text', required: true },
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'category', label: 'Category', type: 'select', options: ['antenna', 'radio', 'router', 'cable', 'power_equipment', 'hardware', 'tools', 'transport'] },
    { key: 'brand', label: 'Brand', type: 'text' },
    { key: 'model', label: 'Model', type: 'text' },
    { key: 'unit', label: 'Unit', type: 'text' },
    { key: 'quantity', label: 'Quantity', type: 'number' },
    { key: 'reserved', label: 'Reserved', type: 'number' },
    { key: 'reorderPoint', label: 'Reorder Point', type: 'number' },
    { key: 'unitCost', label: 'Unit Cost (Ar)', type: 'number' },
    { key: 'warehouseName', label: 'Warehouse', type: 'select', lookup: { table: 'warehouses', valueKey: 'name', labelKey: 'name' } },
    { key: 'location', label: 'Bin/Location', type: 'text' },
    { key: 'serializable', label: 'Serialized items', type: 'checkbox' },
  ],
  stock_movements: [
    { key: 'itemName', label: 'Item', type: 'select', required: true, lookup: { table: 'inventory_items', valueKey: 'name', labelKey: 'name', labelFormat: '{sku} — {name}', orderBy: 'name', populate: { itemId: 'id' } } },
    { key: 'type', label: 'Type', type: 'select', options: ['in', 'out', 'transfer', 'adjustment'] },
    { key: 'quantity', label: 'Quantity', type: 'number', required: true },
    { key: 'fromWarehouse', label: 'From Warehouse', type: 'text' },
    { key: 'toWarehouse', label: 'To Warehouse', type: 'text' },
    { key: 'projectName', label: 'Project', type: 'select', lookup: { table: 'projects', valueKey: 'name', labelKey: 'name', populate: { projectId: 'id' } } },
    { key: 'reason', label: 'Reason', type: 'text' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'performedBy', label: 'Performed By', type: 'text' },
  ],
  quotes: [
    { key: 'number', label: 'Number', type: 'text', required: true, placeholder: 'QT-2026-001' },
    { key: 'customerName', label: 'Customer', type: 'select', lookup: { table: 'companies', valueKey: 'name', labelKey: 'name', populate: { customerId: 'id' } } },
    { key: 'deliveryType', label: 'Delivery Type', type: 'select', options: ['ASP', 'SUPPLY'] },
    { key: 'status', label: 'Status', type: 'select', options: ['draft', 'sent', 'accepted', 'rejected', 'expired'] },
    { key: 'items', label: 'Line Items', type: 'lineItems', importExcel: true },
    { key: 'subtotal', label: 'Subtotal (Ar)', type: 'number' },
    { key: 'taxRate', label: 'Tax Rate %', type: 'number' },
    { key: 'tax', label: 'Tax (Ar)', type: 'number' },
    { key: 'total', label: 'Total (Ar)', type: 'number' },
    { key: 'validUntil', label: 'Valid Until', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  invoices: [
    { key: 'number', label: 'Number', type: 'text', required: true, placeholder: 'INV-2026-001' },
    { key: 'customerName', label: 'Customer', type: 'select', lookup: { table: 'companies', valueKey: 'name', labelKey: 'name', populate: { customerId: 'id' } } },
    { key: 'status', label: 'Status', type: 'select', options: ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'] },
    { key: 'items', label: 'Line Items', type: 'lineItems' },
    { key: 'subtotal', label: 'Subtotal (Ar)', type: 'number' },
    { key: 'taxRate', label: 'Tax Rate %', type: 'number' },
    { key: 'tax', label: 'Tax (Ar)', type: 'number' },
    { key: 'total', label: 'Total (Ar)', type: 'number' },
    { key: 'paid', label: 'Paid (Ar)', type: 'number' },
    { key: 'issueDate', label: 'Issue Date', type: 'date' },
    { key: 'dueDate', label: 'Due Date', type: 'date', required: true },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  purchase_orders: [
    { key: 'number', label: 'Number', type: 'text', required: true, placeholder: 'PO-2026-001' },
    { key: 'vendorName', label: 'Vendor', type: 'select', lookup: { table: 'companies', valueKey: 'name', labelKey: 'name', populate: { vendorId: 'id' } } },
    // delivery_type is NOT editable here — it follows the source Quote.
    { key: 'status', label: 'Status', type: 'select', options: ['draft', 'approved', 'sent', 'partial', 'accepted', 'received', 'cancelled'] },
    { key: 'items', label: 'Line Items', type: 'lineItems' },
    { key: 'subtotal', label: 'Subtotal (Ar)', type: 'number' },
    { key: 'tax', label: 'Tax (Ar)', type: 'number' },
    { key: 'total', label: 'Total (Ar)', type: 'number' },
    { key: 'orderDate', label: 'Order Date', type: 'date' },
    { key: 'expectedDelivery', label: 'Expected Delivery', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  payments: [
    { key: 'invoiceNumber', label: 'Invoice #', type: 'text' },
    { key: 'customerName', label: 'Customer', type: 'select', lookup: { table: 'companies', valueKey: 'name', labelKey: 'name' } },
    { key: 'amount', label: 'Amount (Ar)', type: 'number', required: true },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'method', label: 'Method', type: 'select', options: ['bank_transfer', 'mobile_money', 'check', 'cash'] },
    { key: 'reference', label: 'Reference', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  evm_metrics: [
    { key: 'siteId', label: 'Project & Site', type: 'sitePicker', required: true, virtual: true, projectNameField: 'projectName', projectsTable: 'projects', lookup: { table: 'sites', valueKey: 'id', labelKey: 'name', labelFormat: '{siteId} — {name}' } },
    { key: 'projectName', label: 'Project', type: 'text' },
    { key: 'customerName', label: 'Customer', type: 'select', lookup: { table: 'companies', valueKey: 'name', labelKey: 'name' } },
    { key: 'dataDate', label: 'Data Date', type: 'date' },
    { key: 'po', label: 'PO from Customer (Ar)', type: 'number' },
    { key: 'bac', label: 'BAC — Internal Budget (Ar)', type: 'number' },
    { key: 'pv', label: 'PV (Ar)', type: 'number' },
    { key: 'ac', label: 'AC (Ar)', type: 'number' },
    { key: 'percentComplete', label: 'Percent Complete', type: 'number' },
  ],
  survey_reports: [
    { key: 'siteCode', label: 'Site Code', type: 'select', required: true, lookup: { table: 'sites', valueKey: 'siteId', labelKey: 'name', labelFormat: '{siteId} — {name}', orderBy: 'siteId', populate: { siteName: 'name', latitude: 'latitude', longitude: 'longitude', siteId: 'id' } } },
    { key: 'siteName', label: 'Site Name', type: 'text' },
    FIELD_PROJECT,
    PROJECT_MANAGER_FIELD,
    { key: 'status', label: 'Status', type: 'select', options: ['planned', 'assigned', 'survey_started', 'survey_completed', 'approved'] },
    { key: 'scheduledDate', label: 'Scheduled Date', type: 'date' },
    ...FIELD_CREW,
    { key: 'towerType', label: 'Tower Type', type: 'text' },
    { key: 'towerHeight', label: 'Tower Height (m)', type: 'number' },
    { key: 'shelterAvailable', label: 'Shelter Available', type: 'checkbox' },
    { key: 'generatorAvailable', label: 'Generator Available', type: 'checkbox' },
    { key: 'powerSource', label: 'Power Source', type: 'text' },
    { key: 'transmissionType', label: 'Transmission', type: 'select', options: ['fiber', 'mw', 'vsat', 'none'] },
    { key: 'accessibility', label: 'Accessibility', type: 'select', options: ['easy', 'moderate', 'difficult', 'very_difficult'] },
    { key: 'latitude', label: 'Latitude', type: 'number' },
    { key: 'longitude', label: 'Longitude', type: 'number' },
    { key: 'risks', label: 'Risks', type: 'textarea' },
    { key: 'comments', label: 'Comments', type: 'textarea' },
    { key: 'recommendations', label: 'Recommendations', type: 'textarea' },
  ],
  installation_records: [
    { key: 'siteCode', label: 'Site Code', type: 'select', lookup: { table: 'sites', valueKey: 'siteId', labelKey: 'name', labelFormat: '{siteId} — {name}', orderBy: 'siteId', populate: { siteName: 'name', siteId: 'id' } } },
    { key: 'siteName', label: 'Site Name', type: 'text' },
    { key: 'projectName', label: 'Project', type: 'select', lookup: { table: 'projects', valueKey: 'name', labelKey: 'name', populate: { projectId: 'id' } } },
    PROJECT_MANAGER_FIELD,
    { key: 'status', label: 'Status', type: 'select', options: ['pending', 'material_delivered', 'install_started', 'install_completed', 'quality_check', 'approved'] },
    ...FIELD_CREW,
    { key: 'comments', label: 'Comments', type: 'textarea' },
  ],
  integration_records: [
    { key: 'siteCode', label: 'Site Code', type: 'select', lookup: { table: 'sites', valueKey: 'siteId', labelKey: 'name', labelFormat: '{siteId} — {name}', orderBy: 'siteId', populate: { siteName: 'name', siteId: 'id' } } },
    { key: 'siteName', label: 'Site Name', type: 'text' },
    { key: 'projectName', label: 'Project', type: 'select', lookup: { table: 'projects', valueKey: 'name', labelKey: 'name', populate: { projectId: 'id' } } },
    PROJECT_MANAGER_FIELD,
    { key: 'status', label: 'Status', type: 'select', options: ['pending', 'integration_started', 'testing', 'integrated', 'accepted'] },
    ...FIELD_CREW,
    { key: 'bbuModel', label: 'BBU Model', type: 'text' },
    { key: 'bbuSerial', label: 'BBU Serial', type: 'text' },
    { key: 'ipAddress', label: 'IP Address', type: 'text' },
    { key: 'vlanId', label: 'VLAN ID', type: 'text' },
    { key: 'vswr', label: 'VSWR', type: 'number' },
    { key: 'throughputDL', label: 'Throughput DL', type: 'number' },
    { key: 'throughputUL', label: 'Throughput UL', type: 'number' },
    { key: 'comments', label: 'Comments', type: 'textarea' },
  ],
  atp_templates: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'version', label: 'Version', type: 'text' },
    { key: 'customer', label: 'Customer', type: 'select', lookup: { table: 'companies', valueKey: 'name', labelKey: 'name' } },
    { key: 'technologies', label: 'Technologies', type: 'tags' },
    { key: 'isActive', label: 'Active', type: 'checkbox' },
  ],
  atp_records: [
    { key: 'atpNumber', label: 'ATP Number', type: 'text', required: true, placeholder: 'ATP-2026-001' },
    { key: 'siteCode', label: 'Site Code', type: 'select', lookup: { table: 'sites', valueKey: 'siteId', labelKey: 'name', labelFormat: '{siteId} — {name}', orderBy: 'siteId', populate: { siteName: 'name', siteId: 'id' } } },
    { key: 'siteName', label: 'Site Name', type: 'text' },
    { key: 'templateName', label: 'Template', type: 'select', lookup: { table: 'atp_templates', valueKey: 'name', labelKey: 'name' } },
    { key: 'status', label: 'Status', type: 'select', options: ['draft', 'submitted', 'reviewed', 'approved', 'customer_accepted', 'failed'] },
    { key: 'overallResult', label: 'Overall Result', type: 'select', options: ['pass', 'fail', 'partial'] },
    { key: 'engineerName', label: 'Engineer', type: 'text' },
    { key: 'customerRepresentative', label: 'Customer Rep', type: 'text' },
    { key: 'comments', label: 'Comments', type: 'textarea' },
  ],
  acceptance_certificates: [
    { key: 'certificateNumber', label: 'Certificate Number', type: 'text', required: true, placeholder: 'PAC-2026-001' },
    { key: 'type', label: 'Type', type: 'select', options: ['PAC', 'FAC'], chips: true },
    { key: 'siteCode', label: 'Site Code', type: 'select', lookup: { table: 'sites', valueKey: 'siteId', labelKey: 'name', labelFormat: '{siteId} — {name}', orderBy: 'siteId', populate: { siteName: 'name', siteId: 'id' } } },
    { key: 'siteName', label: 'Site Name', type: 'text' },
    { key: 'projectName', label: 'Project', type: 'select', lookup: { table: 'projects', valueKey: 'name', labelKey: 'name', populate: { projectId: 'id' } } },
    { key: 'atpNumber', label: 'ATP Record', type: 'select', lookup: { table: 'atp_records', valueKey: 'atpNumber', labelKey: 'atpNumber', populate: { atpRecordId: 'id', siteName: 'siteName', siteCode: 'siteCode' } } },
    { key: 'status', label: 'Status', type: 'select', options: ['draft', 'submitted', 'reviewed', 'issued', 'signed', 'rejected'] },
    { key: 'engineerName', label: 'Engineer', type: 'text' },
    { key: 'customerRepresentative', label: 'Customer Rep', type: 'text' },
    { key: 'dlpStartDate', label: 'DLP Start', type: 'date' },
    { key: 'dlpEndDate', label: 'DLP End', type: 'date' },
    { key: 'comments', label: 'Comments', type: 'textarea' },
  ],
  payment_schedules: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'isActive', label: 'Active', type: 'checkbox' },
  ],
  project_payment_milestones: [
    { key: 'projectName', label: 'Project', type: 'select', lookup: { table: 'projects', valueKey: 'name', labelKey: 'name', populate: { projectId: 'id' } } },
    { key: 'scheduleName', label: 'Schedule', type: 'text' },
    { key: 'name', label: 'Milestone', type: 'text', required: true },
    { key: 'pct', label: '%', type: 'number' },
    { key: 'trigger', label: 'Trigger', type: 'select', options: ['advance', 'PAC', 'FAC', 'manual'] },
    { key: 'dueDays', label: 'Due Days', type: 'number' },
    { key: 'amount', label: 'Amount (Ar)', type: 'number' },
    { key: 'status', label: 'Status', type: 'select', options: ['pending', 'invoiced', 'paid', 'cancelled'] },
    { key: 'invoiceNumber', label: 'Invoice', type: 'text' },
    { key: 'dueDate', label: 'Due Date', type: 'date' },
  ],
  boqs: [
    // RAN/MW toggle sits ABOVE everything else: it is required before the
    // catalog item picker can be opened, and is saved onto the BOQ record.
    { key: 'networkType', label: 'Network', type: 'select', options: ['RAN', 'MW'], chips: true, required: true },
    { key: 'boqNumber', label: 'BOQ Number', type: 'text', required: true, placeholder: 'BOQ-2026-001' },
    { key: 'projectName', label: 'Project', type: 'select', lookup: { table: 'projects', valueKey: 'name', labelKey: 'name', populate: { projectId: 'id' } } },
    { key: 'customerName', label: 'Customer', type: 'select', lookup: { table: 'companies', valueKey: 'name', labelKey: 'name', populate: { customerId: 'id' } } },
    { key: 'siteName', label: 'Site', type: 'select', lookup: { table: 'sites', valueKey: 'name', labelKey: 'name', labelFormat: '{siteId} — {name}', orderBy: 'siteId', populate: { siteId: 'id' } } },
    { key: 'status', label: 'Status', type: 'select', options: ['draft', 'submitted', 'approved', 'revised', 'superseded'] },
    // Items come from the catalog picker (catalogItems): manual row edit/delete
    // stays, adding happens via ItemPickerModal gated on networkType.
    { key: 'items', label: 'Line Items', type: 'catalogItems', lineColumns: BOQ_LINE_COLUMNS, derive: boqDerive, networkField: 'networkType' },
    { key: 'subtotal', label: 'Subtotal (Ar)', type: 'number' },
    { key: 'contingencyPct', label: 'Contingency %', type: 'number' },
    { key: 'contingency', label: 'Contingency (Ar)', type: 'number' },
    { key: 'grandTotal', label: 'Grand Total (Ar)', type: 'number' },
    { key: 'createdBy', label: 'Created By', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  // Read-only catalog: registered so the config↔schema invariant holds; not
  // rendered by any module form (BOQ items are added through the picker).
  catalog_items: [
    { key: 'itemCode', label: 'Item Code', type: 'text' },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'networkType', label: 'Network', type: 'select', options: ['RAN', 'MW'] },
    { key: 'unitCost', label: 'Unit Cost', type: 'number' },
    { key: 'defaultQty', label: 'Default Qty', type: 'number' },
    { key: 'category', label: 'Category', type: 'select', options: ['civil', 'supply', 'installation', 'integration', 'testing', 'pm', 'hse', 'other'] },
    { key: 'unit', label: 'Unit', type: 'text' },
    { key: 'comments', label: 'Comments', type: 'textarea' },
    { key: 'remarks', label: 'Remarks', type: 'textarea' },
  ],
  assets: [
    { key: 'assetTag', label: 'Asset Tag', type: 'text', required: true },
    { key: 'serialNumber', label: 'Serial Number', type: 'text' },
    { key: 'category', label: 'Category', type: 'select', options: ['antenna', 'radio', 'router', 'cable', 'power_equipment', 'hardware', 'tools', 'transport'] },
    { key: 'brand', label: 'Brand', type: 'text' },
    { key: 'model', label: 'Model', type: 'text' },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: ['in_warehouse', 'reserved', 'in_transit', 'on_vehicle', 'on_site', 'installed', 'defective', 'under_repair', 'decommissioned'] },
    { key: 'condition', label: 'Condition', type: 'select', options: ['new', 'good', 'fair', 'poor', 'defective'] },
    { key: 'currentLocation', label: 'Current Location', type: 'text' },
    { key: 'purchaseDate', label: 'Purchase Date', type: 'date' },
    { key: 'purchaseCost', label: 'Purchase Cost (Ar)', type: 'number' },
    { key: 'supplierName', label: 'Supplier', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  employees: [
    { key: 'employeeNumber', label: 'Employee #', type: 'text' },
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'role', label: 'Role', type: 'select', options: ['Team Leader', 'Technician', 'Rigger', 'Driver', 'Inspector', 'Manager', 'CEO'] },
    { key: 'department', label: 'Department', type: 'select', options: [...DEPARTMENTS] },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'skills', label: 'Skills', type: 'tags' },
    { key: 'status', label: 'Status', type: 'select', options: ['available', 'assigned', 'on_leave', 'sick', 'training', 'unavailable'] },
    { key: 'dailyRate', label: 'Daily Rate (Ar)', type: 'number' },
    { key: 'joinedAt', label: 'Joined', type: 'date' },
  ],
  vehicles: [
    { key: 'registration', label: 'Registration', type: 'text', required: true },
    { key: 'make', label: 'Make', type: 'text' },
    { key: 'model', label: 'Model', type: 'text' },
    { key: 'year', label: 'Year', type: 'number' },
    { key: 'type', label: 'Type', type: 'select', options: ['4x4', 'pickup', 'van', 'crane', 'flatbed', 'motorcycle'] },
    { key: 'status', label: 'Status', type: 'select', options: ['available', 'in_use', 'maintenance', 'breakdown'] },
    { key: 'driverName', label: 'Driver', type: 'text' },
    { key: 'currentOdometer', label: 'Odometer (km)', type: 'number' },
    { key: 'fuelType', label: 'Fuel Type', type: 'select', options: ['petrol', 'diesel'] },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  tools: [
    { key: 'toolCode', label: 'Tool Code', type: 'text', required: true },
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'category', label: 'Category', type: 'text' },
    { key: 'serialNumber', label: 'Serial Number', type: 'text' },
    { key: 'condition', label: 'Condition', type: 'select', options: ['good', 'fair', 'poor', 'requires_calibration'] },
    { key: 'assignedTo', label: 'Assigned To', type: 'text' },
    { key: 'assignedProject', label: 'Assigned Project', type: 'text' },
    { key: 'nextCalibration', label: 'Next Calibration', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ],
  purchase_requests: [
    { key: 'prNumber', label: 'PR Number', type: 'text', required: true, placeholder: 'PR-2026-001' },
    { key: 'requestedByName', label: 'Requested By', type: 'text' },
    { key: 'projectName', label: 'Project', type: 'select', lookup: { table: 'projects', valueKey: 'name', labelKey: 'name', populate: { projectId: 'id' } } },
    { key: 'urgency', label: 'Urgency', type: 'select', options: ['normal', 'urgent', 'critical'] },
    { key: 'status', label: 'Status', type: 'select', options: ['draft', 'pending_approval', 'approved', 'rejected', 'po_raised', 'cancelled'] },
    { key: 'totalEstimated', label: 'Total Estimated (Ar)', type: 'number' },
    { key: 'justification', label: 'Justification', type: 'textarea' },
    { key: 'requiredBy', label: 'Required By', type: 'date' },
  ],
  subcontractors: [
    { key: 'companyName', label: 'Company', type: 'select', required: true, lookup: { table: 'companies', valueKey: 'name', labelKey: 'name', populate: { companyId: 'id' } } },
    { key: 'contactPerson', label: 'Contact Person', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'specializations', label: 'Specializations', type: 'tags' },
    { key: 'technologies', label: 'Technologies', type: 'tags' },
    { key: 'regions', label: 'Regions', type: 'tags' },
    { key: 'contractValue', label: 'Contract Value (Ar)', type: 'number' },
    { key: 'isApproved', label: 'Approved', type: 'checkbox' },
  ],
  documents: [
    { key: 'docNumber', label: 'Doc Number', type: 'text', required: true },
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'type', label: 'Type', type: 'select', options: ['contract', 'po', 'atp_report', 'survey_report', 'drawing', 'as_built', 'sow', 'boq', 'invoice', 'nda', 'safety_plan', 'method_statement', 'other'] },
    { key: 'status', label: 'Status', type: 'select', options: ['draft', 'under_review', 'approved', 'superseded', 'archived'] },
    { key: 'fileUrl', label: 'File URL', type: 'text' },
    { key: 'tags', label: 'Tags', type: 'tags' },
    { key: 'uploadedByName', label: 'Uploaded By', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'isConfidential', label: 'Confidential', type: 'checkbox' },
  ],
  contracts: [
    { key: 'contractNumber', label: 'Contract Number', type: 'text', required: true },
    { key: 'customerName', label: 'Customer', type: 'select', lookup: { table: 'companies', valueKey: 'name', labelKey: 'name', populate: { customerId: 'id' } } },
    { key: 'type', label: 'Type', type: 'select', options: ['framework', 'project', 'maintenance', 'supply'] },
    { key: 'value', label: 'Value (Ar)', type: 'number' },
    { key: 'startDate', label: 'Start Date', type: 'date' },
    { key: 'endDate', label: 'End Date', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: ['draft', 'active', 'completed', 'terminated', 'expired'] },
    { key: 'scopeOfWork', label: 'Scope of Work', type: 'textarea' },
    { key: 'paymentTerms', label: 'Payment Terms', type: 'text' },
    { key: 'retentionPct', label: 'Retention %', type: 'number' },
  ],
  users: [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'email', label: 'Email', type: 'text', required: true },
    { key: 'role', label: 'Role', type: 'select', options: ['CEO', 'Manager', 'Inspector', 'Team Leader'] },
    { key: 'permissions', label: 'Module Permissions', type: 'permissions' },
    { key: 'department', label: 'Department', type: 'select', options: ['Direction', 'HSE', 'Logistic', 'Project'] },
    { key: 'phone', label: 'Phone', type: 'text' },
  ],
}

// Guard: every table needs a form config, otherwise its New/Edit modal
// renders blank. Warn loudly instead of letting it fail silently.
for (const t of Object.values(TABLES)) {
  if (!FIELD_CONFIGS[t]) {
    console.warn(`[entityConfigs] Missing FIELD_CONFIGS for table "${t}" — its form will be blank`)
  }
}

export { TECHS, REGIONS }
