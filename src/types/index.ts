// ─── AUTH / RBAC ────────────────────────────────────────────────────────────
export type Role = 'CEO' | 'Manager' | 'Inspector' | 'Team Leader';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar: string;
  department: string;
  phone: string;
  /** Per-module grants set by the CEO: { module: 'view' | 'edit' | 'none' }. Missing = no access. */
  permissions?: Record<string, StoredPermissionLevel>;
}

export type PermissionLevel = 'view' | 'edit'

/** What is actually stored in the users.permissions JSONB. 'none' is stored
 * explicitly as a denial; missing = no access (grants come only from the CEO). */
export type StoredPermissionLevel = 'view' | 'edit' | 'none'

/** Departments selectable in the Team form. */
export const DEPARTMENTS = ['Direction', 'HSE', 'Logistic', 'Project'] as const

/** Modules shown in the Team permission matrix. Access is grant-based: only
 * the CEO (admin, full access) grants view/edit per member; missing = no
 * access. Roles themselves no longer imply module access. */
export const PERMISSION_MODULES: { key: string; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'team',      label: 'Team' },
  { key: 'crm',       label: 'CRM' },
  { key: 'customers', label: 'Customers' },
  { key: 'sites',     label: 'Telecom Sites' },
  { key: 'projects',  label: 'Projects' },
  { key: 'tasks',     label: 'Task Board' },
  { key: 'evm',       label: 'Project Controls (EVM)' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'finance',   label: 'Finance' },
]

// ─── CRM ────────────────────────────────────────────────────────────────────
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'unqualified';
export type OpportunityStage = 'prospecting' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

export interface Lead {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  status: LeadStatus;
  source: 'referral' | 'tender' | 'cold_call' | 'website' | 'partner';
  value: number;
  assignedTo: string;
  createdAt: string;
  notes: string;
}

export interface Opportunity {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  stage: OpportunityStage;
  value: number;
  probability: number;
  expectedClose: string;
  assignedTo: string;
  technologies: Technology[];
  siteCount: number;
  notes: string;
  createdAt: string;
}

// ─── CUSTOMERS ──────────────────────────────────────────────────────────────
export type CompanyType = 'telecom_operator' | 'tower_company' | 'vendor' | 'subcontractor' | 'government';

export interface Company {
  id: string;
  name: string;
  type: CompanyType;
  country: string;
  city: string;
  address: string;
  website: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Contact {
  id: string;
  companyId: string;
  companyName: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

// ─── SITES ──────────────────────────────────────────────────────────────────
export type Technology = '2G' | '3G' | '4G' | '4G+' | '5G' | 'MW' | 'VSAT';
export type SiteStatus = 'planned' | 'survey' | 'installation' | 'integration' | 'atp' | 'acceptance' | 'live' | 'decommissioned';
export type Region = 'Antananarivo' | 'Fianarantsoa' | 'Toamasina' | 'Mahajanga' | 'Toliara' | 'Antsiranana' | 'Antsirabe' | 'Morondava';
export type TowerType = 'greenfield' | 'rooftop' | 'mast' | 'shared_tower';
export type PowerSource = 'grid' | 'generator' | 'solar' | 'hybrid';

export interface Site {
  id: string;
  siteId: string;
  name: string;
  region: Region;
  latitude: number;
  longitude: number;
  technology: Technology[];
  status: SiteStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  towerType: TowerType;
  powerSource: PowerSource;
  accessType: 'road' | 'offroad' | 'boat';
  distanceKm?: number;
  altitude?: number;
  revenue: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ─── PROJECTS ───────────────────────────────────────────────────────────────
export type ProjectPhase = 'survey' | 'installation' | 'integration' | 'atp' | 'acceptance';
export type ProjectStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';

export interface PhaseDetail {
  phase: ProjectPhase;
  status: 'pending' | 'in_progress' | 'completed';
  plannedStart: string;
  plannedEnd: string;
  actualStart?: string;
  actualEnd?: string;
  completionPct: number;
}

export interface ProjectSite {
  id?: string;
  projectId: string;
  siteId: string;
  createdAt?: string;
}

export interface Project {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  /** View-model enrichment: the linked site id (from project_sites), NOT a column. */
  siteId?: string;
  status: ProjectStatus;
  currentPhase: ProjectPhase;
  phases: PhaseDetail[];
  startDate: string;
  endDate: string;
  budget: number;
  spent: number;
  revenue: number;
  pm: string;
  team: string[];
  progress: number;
  region: Region;
  createdAt: string;
  /** Supply/trading line (default 'telecom_service' when absent). */
  projectType?: ProjectType;
  customerContact?: string;
  deliveryDeadline?: string;
  deliveryAddress?: string;
  deliveryStatus?: DeliveryStatus;
  poReference?: string;
  notes?: string;
}

/** Discriminates the two project business lines. */
export type ProjectType = 'telecom_service' | 'supply_trading';
export type DeliveryStatus = 'pending' | 'partial' | 'delivered';

/** One goods line of a supply/trading project (project_supply_items). Totals
 * are computed client-side (totalSelling = qty × sellingPrice, etc.). */
export interface SupplyItem {
  id?: string;
  projectId?: string;
  code?: string;
  description: string;
  unit: string;
  qty: number;
  purchasePrice: number;
  sellingPrice: number;
  totalSelling?: number;
  totalCost?: number;
  margin?: number;
}

// ─── TASKS ──────────────────────────────────────────────────────────────────
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  projectId: string;
  projectName: string;
  siteId?: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string;
  assigneeName: string;
  dueDate: string;
  estimatedHours: number;
  loggedHours: number;
  phase: ProjectPhase;
  dependencies: string[];
  tags: string[];
  createdAt: string;
}

// ─── INVENTORY ──────────────────────────────────────────────────────────────
export type ItemCategory = 'antenna' | 'radio' | 'router' | 'cable' | 'power_equipment' | 'hardware' | 'tools' | 'transport';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: ItemCategory;
  brand: string;
  model: string;
  unit: string;
  quantity: number;
  reserved: number;
  reorderPoint: number;
  unitCost: number;
  warehouseId: string;
  warehouseName: string;
  location: string;
  serializable: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  city: string;
  manager: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  type: 'in' | 'out' | 'transfer' | 'adjustment';
  quantity: number;
  fromWarehouse?: string;
  toWarehouse?: string;
  projectId?: string;
  projectName?: string;
  reason: string;
  date: string;
  performedBy: string;
}

// ─── FINANCE ────────────────────────────────────────────────────────────────
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
export type POStatus = 'draft' | 'approved' | 'sent' | 'partial' | 'accepted' | 'received' | 'cancelled';

/** Delivery channel on a PO — ASP (telecom services) vs SUPPLY (goods). */
export type DeliveryType = 'ASP' | 'SUPPLY';

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface Quote {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  projectId?: string;
  status: QuoteStatus;
  items: LineItem[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  validUntil: string;
  createdAt: string;
  notes: string;
}

export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  projectId?: string;
  quoteId?: string;
  status: InvoiceStatus;
  items: LineItem[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  issueDate: string;
  dueDate: string;
  notes: string;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  vendorId: string;
  vendorName: string;
  projectId?: string;
  /** Source Quote this PO was created from (set by the quote-accepted automation). */
  quoteId?: string;
  /** ASP = service PO, SUPPLY = goods PO (drives the auto-project trigger). */
  deliveryType?: DeliveryType;
  status: POStatus;
  items: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  orderDate: string;
  expectedDelivery: string;
  notes: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  date: string;
  method: 'bank_transfer' | 'mobile_money' | 'check' | 'cash';
  reference: string;
  notes: string;
}

// ─── EVM ────────────────────────────────────────────────────────────────────
export interface EVMSnapshot {
  date: string;
  pv: number;
  ev: number;
  ac: number;
}

export interface EVMMetrics {
  id?: string;
  projectId: string;
  projectName: string;
  customerName: string;
  po: number;
  bac: number;
  pv: number;
  ev: number;
  ac: number;
  sv: number;   // EV - PV
  cv: number;   // EV - AC
  spi: number;  // EV / PV
  cpi: number;  // EV / AC
  eac: number;  // BAC / CPI
  etc: number;  // EAC - AC
  vac: number;  // BAC - EAC
  tcpi: number; // (BAC - EV) / (BAC - AC)
  percentComplete: number;
  dataDate: string;
  history: EVMSnapshot[];
}

// ─── DASHBOARD ──────────────────────────────────────────────────────────────
export interface KPICard {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: string;
  color: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'cyan';
}
