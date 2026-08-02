# TelecomERP v2 — Architecture Document
## Complete Telecom Deployment & Operations Platform

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    TelecomERP v2                            │
│          Network Deployment Management Platform             │
├──────────────┬──────────────┬──────────────┬───────────────┤
│  Web Client  │ Mobile (PWA) │  Admin Panel │  API Clients  │
│  React + TS  │ Offline-first│  Supabase    │  3rd Party    │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬────────┘
       │              │              │              │
       └──────────────┴──────────────┴──────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Supabase BaaS   │
                    │  ┌─────────────┐  │
                    │  │  PostgreSQL │  │
                    │  │  (no PostGIS)│  │
                    │  └─────────────┘  │
                    │  ┌─────────────┐  │
                    │  │  Realtime   │  │
                    │  │  WebSockets │  │
                    │  └─────────────┘  │
                    │  ┌─────────────┐  │
                    │  │ Demo Auth   │  │
                    │  └─────────────┘  │
                    │  ┌─────────────┐  │
                    │  │   Storage   │  │
                    │  │  (planned)  │  │
                    │  │  later)     │  │
                    │  └─────────────┘  │
                    └───────────────────┘
```

---

## Module Architecture

### V1 Modules (Preserved)
| Module | Path | Description |
|--------|------|-------------|
| Executive Dashboard | `/dashboard` | KPIs, revenue charts, pipeline |
| CRM | `/crm` | Leads, opportunities, pipeline Kanban |
| Customers | `/customers` | Companies & contacts |
| Telecom Sites | `/sites` | Site register with GPS |
| Projects | `/projects` | Phase tracking, budget |
| Task Board | `/tasks` | 5-column Kanban |
| Inventory | `/inventory` | Stock, warehouses, movements |
| Finance | `/finance` | Quotes, invoices, POs, payments |
| Project Controls | `/evm` | Full EVM: PV, EV, AC, CPI, SPI, EAC |
| Team | `/team` | Profiles, certifications, workload |

### V2 Modules (New)
| Module | Path | Description |
|--------|------|-------------|
| Telecom Dashboard | `/telecom-dashboard` | Full telecom KPI executive view |
| Field Operations | `/field-ops` | Survey → Install → Integration workflows |
| ATP Management | `/atp` | Templates, checklists, digital signatures |
| BOQ Management | `/boq` | Bills of Quantities with versioning |
| Asset Traceability | `/assets` | Serialized asset tracking + movement audit |
| Resource Management | `/resources` | Engineers, vehicles, tools, calibration |
| Procurement | `/procurement` | PR → RFQ → Quotation → PO workflow |
| Subcontractors | `/subcontractors` | Scorecards, incidents, ranking |
| Documents (DMS) | `/documents` | Versioned DMS with search and access control |

---

## RBAC Matrix

| Permission | admin | pm | engineer | finance | viewer |
|-----------|-------|-----|---------|---------|--------|
| Telecom Dashboard | ✅ | ✅ | ❌ | ✅ | ✅ |
| Field Operations | ✅ | ✅ | ✅ | ❌ | ❌ |
| ATP Records | ✅ | ✅ | ✅ | ❌ | ❌ |
| BOQ (read) | ✅ | ✅ | ❌ | ✅ | ❌ |
| BOQ (write) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Asset Management | ✅ | ✅ | ✅ | ❌ | ❌ |
| Resource Management | ✅ | ✅ | ❌ | ❌ | ❌ |
| Procurement (request) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Procurement (approve) | ✅ | ✅ | ❌ | ✅ | ❌ |
| Subcontractors | ✅ | ✅ | ❌ | ✅ | ❌ |
| Documents (general) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Documents (confidential) | ✅ | ✅ | ❌ | ✅ | ❌ |
| Finance | ✅ | ❌ | ❌ | ✅ | ❌ |
| User Management | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Field Operations Workflow

```
SURVEY
Planned → Assigned → Survey Started → Survey Completed → Approved
           ↓              ↓                  ↓
      Assign team    Capture GPS,        Risk flagged
                     photos, tower      → PM Review
                     characteristics

INSTALLATION
Pending → Material Delivered → Install Started → Install Completed → QC → Approved
               ↓                    ↓                  ↓              ↓
          Inventory             Team on site       Punch list      All items
          reserved              photos logged      created         resolved

INTEGRATION
Pending → Integration Started → Testing → Integrated → Accepted
               ↓                  ↓           ↓
         BBU/RRU config      VSWR/PIM/    RF KPIs
         IP parameters       Throughput   within spec
```

---

## ATP Workflow

```
Draft → Submitted → Reviewed → Approved → Customer Accepted
  ↓         ↓           ↓          ↓            ↓
Create   Engineer    PM/QC     Sign PDF    Customer
from     signs      reviews    generated   countersign
template            results               PDF emailed
```

---

## Procurement Workflow

```
Purchase Request → L1 Approval → L2 Approval (if >threshold)
       ↓               ↓
    Draft PR       Issue RFQ to vendors
       ↓               ↓
   Submit PR      Receive quotations
                       ↓
                 Quotation comparison
                       ↓
                 Select vendor → Raise PO
                       ↓
                 Goods receipt → Match invoice → Payment
```

---

## Mobile App Architecture (PWA / React Native)

```
Mobile App (Expo / React Native)
├── Offline-first with SQLite (expo-sqlite)
├── Sync Engine
│   ├── Background sync every 5 min
│   ├── Conflict resolution: server wins, flag conflicts
│   └── Queue outbound mutations when offline
├── Features
│   ├── GPS location capture (expo-location)
│   ├── Camera + photo upload (expo-camera)
│   ├── Barcode/QR scan (expo-barcode-scanner)
│   ├── Digital signatures (react-native-signature-canvas)
│   └── Push notifications (expo-notifications)
└── Screens
    ├── My Assignments
    ├── Site Visit (Survey/Install/Integration)
    ├── ATP Checklist
    ├── Asset Scan
    └── Photo Upload
```

### Offline Sync Strategy
```
Field Engineer:
  1. Opens app → downloads assigned sites, tasks, ATP templates
  2. Goes offline at remote site
  3. Completes survey, captures GPS + photos locally
  4. Returns to connectivity
  5. App auto-syncs: uploads photos to Supabase Storage,
     updates DB records, resolves conflicts
```

---

## GIS Architecture

### Current state (no PostGIS)
Sites store `latitude`/`longitude` as numeric columns; the UI links out to
Google Maps with those coordinates. The schema does **not** install PostGIS —
spatial SQL (ST_DWithin, ST_ClusterDBSCAN, …) is future work if map clustering
is ever needed.

### Map Layer Strategy
- **Base layer**: OpenStreetMap / Mapbox
- **Site markers**: Color-coded by status (planned/survey/live)
- **Coverage overlay**: KML/GeoJSON from operator NMS
- **MW Links**: Line features between linked sites
- **Heat map**: Site density / project activity
- **Cluster view**: Auto-cluster at low zoom levels

---

## AI Features Roadmap

### Phase 1 — Predictive Analytics (Q3 2026)
```
Input: Historical project data, weather, resource availability
Output: Delay probability per project (0-100%)
Model: Gradient Boosting (scikit-learn) → Supabase Edge Function
```

### Phase 2 — Cost Intelligence (Q4 2026)
```
Input: BOQ items, actuals, market prices
Output: Cost overrun prediction with root cause
Model: XGBoost regression → deployed as Supabase function
```

### Phase 3 — Automated Reports (Q1 2027)
```
Input: Survey photos + commissioning data
Output: Auto-generated site report (PDF)
API: Claude API (claude-sonnet) → summarize + generate PDF
```

### Phase 4 — Resource Optimization (Q2 2027)
```
Input: Skills matrix, availability, site locations
Output: Optimal team assignment per site
Model: Constraint satisfaction + genetic algorithm
```

---

## Security Architecture

```
Authentication:  Demo user-picker over the `users` table (no passwords yet)
Authorization:   UI-level role gating (ROLE_PERMISSIONS / can())
Transport:       TLS 1.3 minimum
API:             Supabase anon key (public)
Storage:         Not wired yet — the Documents module stores file URLs in text fields
Audit:           None yet
Document access: Application level only — RLS policies are open (allow_all)
```

### Approval Workflows
```
PR >5M Ar:    Engineer → PM → Finance Director
PR >50M Ar:   Engineer → PM → Finance → GM
BOQ:          PM → GM → Customer
ATP Result:   Engineer → PM → Customer Rep (digital signature)
PO:           PM → Finance (>threshold: GM)
```

---

## Deployment Architecture

```
Production Stack:
┌─────────────────────┐
│   Vercel / Netlify  │  ← React SPA (CDN)
│   (Static hosting)  │
└──────────┬──────────┘
           │ HTTPS
┌──────────▼──────────┐
│   Supabase Cloud    │  ← BaaS
│   ┌───────────────┐ │
│   │ PostgreSQL 15 │ │  ← Primary DB
│   │ + Read Replica│ │  ← For reporting queries
│   └───────────────┘ │
│   ┌───────────────┐ │
│   │ Edge Functions│ │  ← Deno / serverless
│   └───────────────┘ │
│   ┌───────────────┐ │
│   │ Storage       │ │  ← Photos, documents (S3-compatible)
│   └───────────────┘ │
└─────────────────────┘

Scaling targets:
- 5,000 sites: handled by indexed site code/status queries
- 500 employees: well within Supabase free tier
- 10k daily active requests: handled by connection pooling
- Document storage: 50GB estimated (Supabase Pro plan)
```

---

## Production Roadmap

| Phase | Timeline | Deliverables |
|-------|----------|-------------|
| **1 — Core ERP** | ✅ Done | CRM, Sites, Projects, Tasks, Finance, EVM |
| **2 — Telecom Ops** | ✅ Done | Field Ops, ATP, BOQ, Assets, Resources, DMS |
| **3 — Mobile PWA** | Q3 2026 | Offline survey, photo upload, barcode scan |
| **4 — GIS Maps** | Q3 2026 | Interactive site map, MW links, coverage |
| **5 — AI Analytics** | Q4 2026 | Delay prediction, cost intelligence |
| **6 — Multi-tenant** | Q1 2027 | Company isolation, white-label, billing |
| **7 — Integrations** | Q2 2027 | Nokia OSS, Huawei U2020, Ericsson ENM |
| **8 — Mobile Native** | Q3 2027 | React Native app for Android (field engineers) |

---

## Testing Strategy

```
Unit Tests:
  - All utility functions (EVM calculations, BOQ totals)
  - Workflow state machine transitions
  - RBAC permission checks
  Tool: Vitest

Integration Tests:
  - Schema ↔ app consistency (field configs, case conversion, created_at ordering)
  - RLS policy verification
  - API route coverage
  Tool: Supabase test helpers + Jest

E2E Tests:
  - Critical user journeys (Survey → Install → ATP → Accept)
  - Finance: Quote → Invoice → Payment
  - Procurement: PR → Approval → PO
  Tool: Playwright

Performance Tests:
  - 5,000 sites map render
  - BOQ with 500 line items
  - Concurrent ATP submissions
  Tool: k6
```

---

## File Structure (Final)

```
telecom-erp/
├── database/
│   └── schema.sql                    # Full consolidated schema (30 tables)
├── src/
│   ├── types/
│   │   ├── index.ts                  # V1 types
│   │   └── v2.ts                     # V2 types (30+ interfaces)
│   ├── lib/
│   │   ├── supabase.ts               # Supabase client (env-configured)
│   │   ├── api/crud.ts               # Generic CRUD over Supabase
│   │   └── api/entityConfigs.ts      # Tables + form field configs
│   ├── contexts/
│   │   ├── AuthContext.tsx           # RBAC + user switching
│   │   └── ThemeContext.tsx          # Dark/light mode
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx           # Collapsible groups nav
│   │   │   ├── Header.tsx            # Search, theme, user menu
│   │   │   └── Layout.tsx            # Shell with route titles
│   │   └── ui/
│   │       ├── Badge, Button, Card, Modal, Input, StatCard, DataTable
│   └── modules/
│       ├── exec-dashboard/           # Telecom KPI dashboard
│       ├── field-ops/                # Survey + Install + Integration
│       ├── atp/                      # ATP templates + records
│       ├── boq/                      # BOQ editor + approval
│       ├── assets/                   # Asset register + movements
│       ├── resources/                # Engineers, vehicles, tools
│       ├── procurement/              # PR → RFQ → PO workflow
│       ├── subcontractors/           # Scorecards + incidents
│       ├── dms/                      # Document management
│       ├── dashboards/               # V1 executive dashboard
│       ├── crm, customers, sites, projects, tasks, inventory
│       ├── financial, controls, team  # V1 core modules
│       └── (all 19 modules total)
└── ARCHITECTURE.md
```
