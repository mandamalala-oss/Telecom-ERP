// ============================================================
// TelecomERP v2 — Extended TypeScript Interfaces
// All new types extending v1 without breaking existing code
// ============================================================

import type { Technology, Region, ItemCategory } from './index'

// ─── FIELD OPERATIONS ────────────────────────────────────────

export type SurveyStatus       = 'planned' | 'assigned' | 'survey_started' | 'survey_completed' | 'approved'
export type InstallStatus      = 'pending' | 'material_delivered' | 'install_started' | 'install_completed' | 'quality_check' | 'approved'
export type IntegrationStatus  = 'pending' | 'integration_started' | 'testing' | 'integrated' | 'accepted'

export interface PunchListItem {
  id: string
  description: string
  severity: 'minor' | 'major' | 'critical'
  status: 'open' | 'resolved'
  resolvedBy?: string
  resolvedAt?: string
}

export interface SitePhoto {
  id: string
  url: string
  caption: string
  gpsLat?: number
  gpsLon?: number
  takenAt: string
  takenBy: string
  phase: 'survey' | 'installation' | 'integration' | 'atp' | 'as_built'
}

export interface SurveyReport {
  id: string
  siteId: string
  siteCode: string
  siteName: string
  projectId: string
  status: SurveyStatus
  assignedTo: string[]
  scheduledDate: string
  startedAt?: string
  completedAt?: string
  approvedAt?: string
  approvedBy?: string
  // Physical
  towerType: string
  towerHeight: number
  shelterAvailable: boolean
  shelterSize?: string
  generatorAvailable: boolean
  generatorCapacity?: string
  powerSource: string
  transmissionType: 'fiber' | 'mw' | 'vsat' | 'none'
  accessibility: 'easy' | 'moderate' | 'difficult' | 'very_difficult'
  // GPS
  latitude: number
  longitude: number
  altitude?: number
  // Notes
  risks: string
  comments: string
  recommendations: string
  photos: SitePhoto[]
  engineerSignature?: string
  createdAt: string
  updatedAt: string
}

export interface InstallationRecord {
  id: string
  siteId: string
  projectId: string
  siteCode?: string
  siteName?: string
  projectName?: string
  status: InstallStatus
  team: string[]
  supervisorId: string
  materialDeliveredAt?: string
  startedAt?: string
  completedAt?: string
  approvedAt?: string
  approvedBy?: string
  equipmentInstalled: InstalledEquipment[]
  punchList: PunchListItem[]
  photos: SitePhoto[]
  comments: string
  createdAt: string
  updatedAt: string
}

export interface InstalledEquipment {
  id: string
  assetId: string
  serialNumber: string
  category: string
  brand: string
  model: string
  position: string
  installedAt: string
}

export interface IntegrationRecord {
  id: string
  siteId: string
  projectId: string
  siteCode?: string
  siteName?: string
  projectName?: string
  status: IntegrationStatus
  engineerId: string
  startedAt?: string
  completedAt?: string
  acceptedAt?: string
  // Technical
  bbuModel: string
  bbuSerial: string
  rruModels: string[]
  mwLink?: string
  mwFrequency?: string
  ipAddress?: string
  vlanId?: string
  neighborCells?: string[]
  // Test results
  vswr?: number
  pimLevel?: number
  throughputDL?: number
  throughputUL?: number
  latency?: number
  commissioningData: Record<string, string>
  photos: SitePhoto[]
  comments: string
  createdAt: string
}

// ─── ATP MODULE ──────────────────────────────────────────────

export type ATPStatus = 'draft' | 'submitted' | 'reviewed' | 'approved' | 'customer_accepted' | 'failed'

export interface ATPCheckItem {
  id: string
  testName: string
  testProcedure: string
  expectedResult: string
  passCriteria: string
  mandatory: boolean
  category: 'rf' | 'transmission' | 'power' | 'alarm' | 'software' | 'civil' | 'safety'
}

export interface ATPSection {
  id: string
  title: string
  order: number
  items: ATPCheckItem[]
}

export interface ATPTemplate {
  id: string
  name: string
  version: string
  customer: string
  technologies: Technology[]
  sections: ATPSection[]
  createdAt: string
  isActive: boolean
}

export interface ATPResult {
  itemId: string
  result: 'pass' | 'fail' | 'na' | 'pending'
  actualValue: string
  notes: string
  testedAt?: string
  testedBy?: string
}

export interface ATPRecord {
  id: string
  atpNumber: string
  siteId: string
  siteName: string
  siteCode: string
  projectId: string
  templateId: string
  templateName: string
  status: ATPStatus
  results: ATPResult[]
  passCount: number
  failCount: number
  naCount: number
  overallResult: 'pass' | 'fail' | 'partial'
  engineerId: string
  engineerName: string
  engineerSignature?: string
  customerRepresentative?: string
  customerSignature?: string
  submittedAt?: string
  reviewedAt?: string
  approvedAt?: string
  customerAcceptedAt?: string
  pdfUrl?: string
  comments: string
  createdAt: string
}

// ─── BOQ MODULE ──────────────────────────────────────────────

export type BOQStatus = 'draft' | 'submitted' | 'approved' | 'revised' | 'superseded'

export interface BOQItem {
  id: string
  itemCode: string
  description: string
  unit: string
  quantity: number
  unitCost: number
  totalCost: number
  category: 'civil' | 'supply' | 'installation' | 'integration' | 'testing' | 'pm' | 'hse' | 'other'
  notes?: string
}

export interface BOQ {
  id: string
  boqNumber: string
  version: number
  status: BOQStatus
  projectId: string
  projectName: string
  customerId: string
  customerName: string
  siteId?: string
  siteName?: string
  items: BOQItem[]
  subtotal: number
  contingency: number
  contingencyPct: number
  grandTotal: number
  approvedBy?: string
  approvedAt?: string
  createdBy: string
  createdAt: string
  updatedAt: string
  notes: string
  previousVersionId?: string
}

// ─── ASSET TRACEABILITY ──────────────────────────────────────

export type AssetStatus = 'in_warehouse' | 'reserved' | 'in_transit' | 'on_vehicle' | 'on_site' | 'installed' | 'defective' | 'under_repair' | 'decommissioned'

export interface AssetMovement {
  id: string
  from: string
  to: string
  movedBy: string
  projectId?: string
  siteId?: string
  reason: string
  movedAt: string
  notes: string
}

export interface Asset {
  id: string
  assetTag: string
  serialNumber: string
  barcode: string
  qrCode?: string
  category: ItemCategory
  brand: string
  model: string
  description: string
  status: AssetStatus
  condition: 'new' | 'good' | 'fair' | 'poor' | 'defective'
  currentLocation: string
  warehouseId?: string
  vehicleId?: string
  siteId?: string
  projectId?: string
  purchaseDate?: string
  purchaseCost?: number
  warrantyExpiry?: string
  supplierName?: string
  poNumber?: string
  movements: AssetMovement[]
  photos: string[]
  notes: string
  createdAt: string
  updatedAt: string
}

// ─── RESOURCES ───────────────────────────────────────────────

export type EmployeeRole = 'pm' | 'supervisor' | 'rigger' | 'civil_engineer' | 'rf_engineer' | 'mw_engineer' | 'integration_engineer' | 'hse_officer' | 'driver' | 'helper'
export type EmployeeStatus = 'available' | 'assigned' | 'on_leave' | 'sick' | 'training' | 'unavailable'

export interface Certification {
  id: string
  name: string
  issuedBy: string
  issuedAt: string
  expiresAt: string
  isValid: boolean
}

export interface Employee {
  id: string
  userId?: string
  employeeNumber: string
  name: string
  role: EmployeeRole
  department: string
  email: string
  phone: string
  skills: string[]
  certifications: Certification[]
  status: EmployeeStatus
  currentProjectId?: string
  currentSiteId?: string
  dailyRate: number
  joinedAt: string
}

export interface VehicleFuelLog {
  id: string
  date: string
  liters: number
  costPerLiter: number
  totalCost: number
  odometer: number
  filledBy: string
}

export interface Vehicle {
  id: string
  registration: string
  make: string
  model: string
  year: number
  type: '4x4' | 'pickup' | 'van' | 'crane' | 'flatbed' | 'motorcycle'
  status: 'available' | 'in_use' | 'maintenance' | 'breakdown'
  driverId?: string
  driverName?: string
  currentProjectId?: string
  lastServiceDate?: string
  nextServiceDate?: string
  currentOdometer: number
  fuelType: 'petrol' | 'diesel'
  fuelLogs: VehicleFuelLog[]
  notes: string
}

export interface Tool {
  id: string
  toolCode: string
  name: string
  category: string
  serialNumber?: string
  condition: 'good' | 'fair' | 'poor' | 'requires_calibration'
  assignedTo?: string
  assignedProject?: string
  lastCalibration?: string
  nextCalibration?: string
  returnedAt?: string
  notes: string
}

// ─── PROCUREMENT ─────────────────────────────────────────────

export type PRStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'po_raised' | 'cancelled'
export type POApprovalStatus = 'draft' | 'pending_l1' | 'pending_l2' | 'approved' | 'rejected' | 'sent_to_vendor' | 'acknowledged' | 'partial_delivery' | 'fully_delivered' | 'cancelled'

export interface PRItem {
  id: string
  description: string
  partNumber?: string
  unit: string
  quantityRequested: number
  estimatedUnitCost: number
  estimatedTotal: number
  justification: string
}

export interface PurchaseRequest {
  id: string
  prNumber: string
  requestedBy: string
  requestedByName: string
  projectId?: string
  projectName?: string
  siteId?: string
  urgency: 'normal' | 'urgent' | 'critical'
  status: PRStatus
  items: PRItem[]
  totalEstimated: number
  justification: string
  requiredBy: string
  approvedBy?: string
  approvedAt?: string
  rejectionReason?: string
  linkedPOId?: string
  createdAt: string
}

export interface VendorQuotation {
  id: string
  rfqId: string
  vendorId: string
  vendorName: string
  items: VendorQuoteItem[]
  totalAmount: number
  validUntil: string
  leadTimeDays: number
  paymentTerms: string
  deliveryTerms: string
  notes: string
  submittedAt: string
  isSelected: boolean
}

export interface VendorQuoteItem {
  prItemId: string
  description: string
  unit: string
  quantity: number
  unitPrice: number
  total: number
  brand?: string
  model?: string
  leadDays: number
}

// ─── SUBCONTRACTORS ──────────────────────────────────────────

export interface SubcontractorScore {
  atpSuccessRate: number     // 0-100
  onTimeDelivery: number     // 0-100
  qualityScore: number       // 0-100
  safetyScore: number        // 0-100
  responseTime: number       // 0-100
  overallScore: number       // weighted average
  rating: 'A' | 'B' | 'C' | 'D' | 'F'
}

export interface SubcontractorIncident {
  id: string
  date: string
  type: 'safety' | 'quality' | 'delay' | 'defect' | 'dispute'
  severity: 'minor' | 'major' | 'critical'
  description: string
  resolved: boolean
  penaltyApplied?: number
}

export interface Subcontractor {
  id: string
  companyId: string
  companyName: string
  contactPerson: string
  email: string
  phone: string
  specializations: string[]
  technologies: Technology[]
  regions: Region[]
  contractValue: number
  activeProjects: number
  completedProjects: number
  scores: SubcontractorScore
  incidents: SubcontractorIncident[]
  certifications: string[]
  isApproved: boolean
  approvedAt?: string
  createdAt: string
}

// ─── DOCUMENT MANAGEMENT ─────────────────────────────────────

export type DocType = 'contract' | 'po' | 'atp_report' | 'survey_report' | 'drawing' | 'as_built' | 'sow' | 'boq' | 'invoice' | 'nda' | 'safety_plan' | 'method_statement' | 'other'
export type DocStatus = 'draft' | 'under_review' | 'approved' | 'superseded' | 'archived'

export interface DocLink {
  entityType: 'project' | 'site' | 'customer' | 'contract' | 'task' | 'atp' | 'invoice'
  entityId: string
  entityName: string
}

export interface DocumentRecord {
  id: string
  docNumber: string
  name: string
  type: DocType
  status: DocStatus
  version: number
  previousVersionId?: string
  fileUrl: string
  fileSize: number
  mimeType: string
  tags: string[]
  links: DocLink[]
  uploadedBy: string
  uploadedByName: string
  uploadedAt: string
  approvedBy?: string
  approvedAt?: string
  expiresAt?: string
  description: string
  isConfidential: boolean
  accessRoles: string[]
}

// ─── EXECUTIVE DASHBOARD KPIs ────────────────────────────────

export interface TelecomKPIs {
  // Project KPIs
  totalProjects: number
  activeProjects: number
  completedProjects: number
  delayedProjects: number
  projectsOnTrack: number
  // Site KPIs
  sitesPlanned: number
  sitesSurveyed: number
  sitesInstalled: number
  sitesIntegrated: number
  sitesAccepted: number
  sitesLive: number
  // Financial
  totalRevenue: number
  totalCost: number
  grossMargin: number
  grossMarginPct: number
  pendingAR: number
  overdueAR: number
  budgetUtilisation: number
  // EVM
  avgCPI: number
  avgSPI: number
  totalEAC: number
  totalVAC: number
  // Operations
  atpSuccessRate: number
  atpFailureRate: number
  acceptanceBacklog: number
  resourceUtilisation: number
  openPunchListItems: number
}

// ─── MULTI-TENANCY ───────────────────────────────────────────

export interface Tenant {
  id: string
  name: string
  slug: string
  plan: 'starter' | 'professional' | 'enterprise'
  maxUsers: number
  maxProjects: number
  maxSites: number
  logoUrl?: string
  primaryColor?: string
  modules: string[]
  createdAt: string
}

export interface Contract {
  id: string
  contractNumber: string
  customerId: string
  customerName: string
  type: 'framework' | 'project' | 'maintenance' | 'supply'
  value: number
  currency: string
  startDate: string
  endDate: string
  status: 'draft' | 'active' | 'completed' | 'terminated' | 'expired'
  scopeOfWork: string
  paymentTerms: string
  retentionPct: number
  penaltyClause?: string
  linkedProjectIds: string[]
  documents: string[]
  createdAt: string
}
