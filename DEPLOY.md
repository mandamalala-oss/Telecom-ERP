# TelecomERP — Supabase Deployment

## 1. Set up the database

1. Open your Supabase project → **SQL Editor**.
2. Paste the entire contents of `database/schema.sql` and click **Run**.
   - It drops/recreates the app's tables (safe to re-run), one table per
     data type used by the app (sites, projects, tasks, invoices, etc. — 30 tables total),
     using JSONB/array columns for nested data (line items, phases, photos…).
   - It enables Row Level Security on every table with an **open policy for
     the anon key** (`allow_all_<table>`), since this app doesn't implement
     Supabase Auth yet — it just picks a "logged in" user from the `users`
     table client-side. If you want real per-user login/security later,
     swap those policies for role- or auth.uid()-scoped ones.
   - It seeds one starter user (`malala@manongadoria.mg`) so the app has
     someone to log in as. Add teammates via the **Team** module once running,
     or insert directly into the `users` table.

## 2. Environment

Create `.env` from the template and fill in **your** project's values:

```bash
cp .env.example .env
# VITE_SUPABASE_URL=https://<your-project>.supabase.co
# VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

`src/lib/supabase.ts` reads these at build time. There is deliberately no
hardcoded fallback: if the env vars are missing, the app refuses to start so
misconfigured builds cannot silently connect to the wrong project.

> **Security note:** never commit `.env`. It is git-ignored. If a key was
> ever committed or shipped in a bundle, revoke it in the Supabase dashboard
> (Settings → API) and issue a new one.

## 3. Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
```

## What changed from the mock version

- **All mock data deleted** (`src/lib/mockData.ts`, `mockDataV2.ts`, and the
  unused `src/data/seed.ts` are gone). Every module now reads and writes
  Supabase directly.
- **Generic data layer** (`src/lib/api/`): `crud.ts` gives every table
  list/get/create/update/remove; `case.ts` converts between the DB's
  `snake_case` columns and the app's `camelCase` TypeScript types
  automatically.
- **`useEntity` / `useEntityCrud`** (`src/lib/hooks/`): one hook per module
  gives you live Supabase data plus working Create/Edit/Delete, wired to a
  single reusable, config-driven form modal (`src/components/crud/EntityFormModal.tsx`,
  field configs in `src/lib/api/entityConfigs.ts`).
- **Every module** (Sites, Projects, Tasks, Inventory, Finance, CRM,
  Customers, Field Ops, ATP, BOQ, Assets, Resources, Procurement,
  Subcontractors, Documents, Team, both dashboards, EVM) now has real
  "New", row-level Edit, and Delete buttons that write straight to
  Supabase — no more dead buttons.
- **Login** (`AuthContext`) now reads the real `users` table instead of a
  hardcoded mock list.

## Known scope limits (by design, given the size of this change)

- **No file uploads yet** — the Documents module has a `File URL` text
  field rather than real storage. Wiring Supabase Storage is a natural
  next step if you want actual file hosting.
- **No password-based login** — the app still just lets you pick a user
  (like before), now backed by real rows. Adding Supabase Auth (email/password
  or magic link) is a separate, contained piece of work if you want it.
- **Nested line items** (invoice/quote/PO items, BOQ items, ATP results,
  equipment lists, etc.) are stored as JSONB and are fully readable/exportable,
  but the generic Create/Edit form doesn't yet expose a line-item editor —
  those start empty on new records. Say the word if you want dedicated
  line-item editors for any of these; the data layer already supports it.
