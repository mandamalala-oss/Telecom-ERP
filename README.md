# TelecomERP v2 — Complete Telecom Deployment & Operations ERP

Production-grade platform for telecom contractors managing network rollouts for Nokia, Huawei, Ericsson, and major operators. Built for companies like **Manonga Doria SARLU** subcontracting in Madagascar.

---

## Quick Start

```bash
unzip telecom-erp-v2.zip
cd telecom-erp
npm install
cp .env.example .env          # then fill in your Supabase URL + anon key
npm run dev
# Open http://localhost:5173
```

The app needs a Supabase project with the schema applied (see below) — there is no mock-data mode. If the env vars are missing, the app refuses to start rather than silently connecting to the wrong project.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript 5 |
| Bundler | Vite 5 |
| Styling | Tailwind CSS 3 + Dark Mode |
| Charts | Recharts 2 |
| Icons | Lucide React |
| Backend | Supabase (PostgreSQL) |
| Auth | Demo user-picker backed by the `users` table (no Supabase Auth yet) |

> **Security status:** the app currently implements UI-level roles only. RLS is
> enabled with open `allow_all` policies and there is no password login — fine
> for an internal prototype, **not** for public deployment with real data. See
> DEPLOY.md.

---

## 19 Modules

### Telecom Operations (New in v2)
| Module | Route | What it does |
|--------|-------|-------------|
| Telecom Dashboard | `/telecom-dashboard` | Full KPI executive view: project, site funnel, financial, EVM, ops |
| Field Operations | `/field-ops` | Survey → Installation → Integration workflows with status tracking |
| ATP Management | `/atp` | Templates, test checklists, pass/fail results, digital signatures |
| BOQ Management | `/boq` | Bills of Quantities with versioning, categories, auto-totals |
| Asset Traceability | `/assets` | Serialized assets: barcode → warehouse → vehicle → site → installed |
| Resource Management | `/resources` | Engineers (skills, certs, availability), vehicles, tools + calibration |
| Procurement | `/procurement` | PR → Approval → RFQ → Quotation comparison → PO |
| Subcontractors | `/subcontractors` | Scorecards (ATP/quality/safety), incidents, radar chart, ranking |
| Documents (DMS) | `/documents` | Versioned DMS with tags, links, access control, confidentiality |

### Core ERP (V1, preserved)
CRM · Customers · Sites · Projects · Kanban Tasks · Inventory · Finance · EVM · Team

---

## Supabase Setup

```bash
# 1. Create project at https://supabase.com
# 2. SQL Editor → paste database/schema.sql → Run (drops & recreates app tables; safe to re-run)
# 3. Set env vars
echo "VITE_SUPABASE_URL=https://your-project.supabase.co" >> .env
echo "VITE_SUPABASE_ANON_KEY=your-anon-key"              >> .env
npm run dev
```

The schema is a single consolidated file — there are no migrations to run in
order. It creates 30 tables (nested line items and lists are stored as JSONB /
TEXT[] columns), enables RLS with open per-table policies, and seeds one
starter admin user (`malala@manongadoria.mg`).

---

## RBAC Roles

Switch users via the top-right avatar → "Switch User (Demo)":

| Role | Access |
|------|--------|
| `admin` (Jakoba) | Everything |
| `pm` (Fifaliana) | All ops modules, no finance approval |
| `engineer` (Hery, Lanto, Vola) | Field ops, ATP, assets, tasks |
| `finance` (Nirina) | Finance, BOQ read, procurement approval |
| `viewer` | Dashboard + sites read-only |

Roles gate the sidebar and UI only. The database itself is open to the anon
key until real Supabase Auth + role-scoped RLS policies are implemented.

---

## Database Schema Summary

One schema file, 30 tables. Child rows that are edited as a unit (line items,
ATP results, equipment lists, movements, photos…) live as JSONB arrays inside
their parent row, which is what keeps the generic CRUD layer simple:

- **CRM:** users, leads, opportunities, companies, contacts
- **Core ERP:** sites, projects, tasks, warehouses, inventory_items,
  stock_movements, quotes, invoices, purchase_orders, payments, evm_metrics
- **Field Ops:** survey_reports, installation_records, integration_records
- **Quality:** atp_templates, atp_records, boqs
- **Ops Support:** assets, employees, vehicles, tools, purchase_requests,
  subcontractors, documents, contracts

There are no separate child tables (`survey_team`, `boq_items`, `atp_results`,
…) and no database views — those live inside the parent rows as JSONB. The
only triggers are `updated_at` timestamps. `invoices.balance` is a generated
stored column (`total - paid`).

---

## Build for Production

```bash
npm run build   # outputs to dist/
```

Deploy `dist/` to Vercel, Netlify, or any static host. Set the two Supabase env vars in the host dashboard.

---

## License
Proprietary — Manonga Doria SARLU © 2026
