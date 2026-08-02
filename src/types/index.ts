// ─── AUTH / RBAC ────────────────────────────────────────────────────────────
export type Role = 'admin' | 'pm' | 'engineer' | 'finance' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar: string;
  department: string;
  phone: string;
}

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin:    ['*'],
  pm:       ['dashboard','crm','customers','sites','projects','tasks','evm','inventory'],
  engineer: ['sites','projects','tasks','inventory'],
  finance:  ['dashboard','finance','customers','evm'],
  viewer:   ['dashboard','sites','projects'],
};

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
  revenue: number;
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
  customerId: string;
  customerName: string;
  region: Region;
  latitude: number;
  longitude: number;
  technology: Technology[];
  status: SiteStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  projectId?: string;
  towerType: TowerType;
  powerSource: PowerSource;
  accessType: 'road' | 'offroad' | 'boat';
  altitude?: number;
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

export interface Project {
  id: string;
  name: string;
  code: string;
  customerId: string;
  customerName: string;
  siteIds: string[];
  status: ProjectStatus;
  currentPhase: ProjectPhase;
  phases: PhaseDetail[];
  startDate: string;
  endDate: string;
  budget: number;
  spent: number;
  pm: string;
  team: string[];
  progress: number;
  region: Region;
  createdAt: string;
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
export type POStatus = 'draft' | 'approved' | 'sent' | 'partial' | 'received' | 'cancelled';

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
