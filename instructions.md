# Project Instructions & Session Handoff — TelecomERP v2

Workspace: `/home/jakoba/Documents/ERP2.0` — React 18 + TS + Vite + Tailwind + Supabase.
Git: **remote `origin` = `https://github.com/kobajah/Manongaerp.git`, branch `main`** (was `master`; renamed on first push).

---

## 📋 What has been done so far (chronological)

### Milestone 1 — Review + fix pass (committed `6b85f85` → `f5bdd40` → `1f40c0c`)
Full codebase review; all fixes committed. See "Fixed — Milestone 1" below. `tsc` + build green.

### Milestone 2 — Remote push (DONE)
- Branch renamed `master` → `main`; pushed to `github.com/kobajah/Manongaerp.git`
- Remote URL is **HTTPS, token-free** (`git remote -v` shows the clean URL)

### Milestone 3 — Vitest test harness (committed `6d0f905`, pushed)
47 tests / 5 files originally. See "Test harness" section.

### Milestone 4 — Module optimization before AUTH (2026-08-03, committed `1faaa0b`)
Revenue model, project/site link direction, EVM CRUD + derived metrics, finance status dropdown, RBAC.

### Milestone 5 — Multi-site projects + grouped EVM (2026-08, committed `e75f4fd` + fixes `c936308`)
Restores "one project = one engagement covering many sites" via a proper junction table; EVM groups per project + customer and lists its sites. See "This session — Milestone 5" below.

### Milestone 6 — EVM: customer PO, derived EV, Benefit (committed `ffadfa8`)
`evm_metrics.po` (customer PO) added; BAC stays internal budget; **EV is derived = BAC × percent_complete** (no manual EV input); **Benefit = PO − AC** shown in detail + customer rollup. Migration `011`.

### Milestone 7 — 1 project = 1 site; EVM groups by project name + per-site filter (committed `a0fd481`)
Projects are **1 project = 1 site** again (single site select; `project_sites` still the link store). Projects module relabels BUDGET/SPENT/REVENUE → **BAC / AC / PO** (DB columns unchanged). EVM page **groups sites by project name** (STARLINK sites combine) with **per-site checkboxes** filtering the combined calculations (default all); merged-history charts; per-site rows with snapshot/edit/delete.

### Milestone 8 — EVM form: project name → site picker, data pull, ≥1 site checked (committed `dfcdea0`)
Generic form gains a **`sitePicker`** field type: the EVM Project dropdown now shows **each project name once** (one STARLINK); after choosing it you pick the **site** (ATS078/ATS169), and the form **pulls PO/BAC/AC/customer from that site's project** (new `extraLookup` modal prop). The EVM page's site filter **keeps every site listed** — unchecked sites stay greyed out and re-check instantly refreshes values (no page refresh); any site can be unchecked (a group with none selected shows a "no sites selected" state). Creating a second site = a second EVM record; the page combines them (BACs add) and lets you display 1 or both via checkboxes. (Follow-up fix `e1e9e3b`.)

### Milestone 9 — Projects filter bar (committed `e9570be`)
Projects page gains a filter bar between the summary cards and the status tabs: **live name search**, **customer dropdown**, **site-code dropdown** (from `project_sites` + sites) — combined with **AND** logic and the existing status tabs, which now show **per-status result counts**.

### Milestone 12 — Team roles + departments (committed `21fc405`)
Roles are now **CEO / Manager / Inspector / Team Leader** (was admin/pm/engineer/finance/viewer) and **Department is a dropdown** (Direction, HSE, Logistic, Project) in the Team form + invite modal. `ROLE_PERMISSIONS` remapped (CEO `*`; Manager all operational modules; Team Leader/Inspector sites+projects+tasks). **Migration `018`** patches the live DB: migrates old roles (admin→CEO, pm/finance→Manager, engineer→Inspector, viewer→Team Leader), new role CHECK + default, sync trigger default `Team Leader`, and re-applies all role-scoped RLS with the new names. 012/016/schema.sql/013 updated for fresh setups.

### Milestone 11 — Team permissions matrix (committed `d197ac6`)
`users.permissions jsonb` (migration 017) — per-member **None/View/Edit** checklist per module (9 modules) in the Team edit form; role defaults (ROLE_PERMISSIONS) with per-user overrides; `can()`/`canEdit()`/`permissionLevel()` in AuthContext honor them; Team detail shows the effective matrix. Admins grant access; adding a login = create the auth user (Supabase → Auth → Add user) and the sync trigger makes the profile.

### Milestone 10 — Auth + RLS (committed `5797c61`)
Real **Supabase Auth (email/password)**: login page, session-based `AuthContext` (getSession + onAuthStateChange), Header shows the signed-in user + logout, `RequireAuth` + per-route `RequireModule` guards (landing/fallback = first allowed module, no loops). **Migration `012`**: `users ↔ auth.users` sync trigger (profile created on signup, default role viewer), role helpers `app_role()`/`app_has_role()`, **role-scoped RLS on 10 core tables** (users, sites, projects, project_sites, tasks, evm_metrics, companies, contacts, invoices, payments) mirroring `ROLE_PERMISSIONS`; other tables keep `allow_all` (phase 2). Admin created in Supabase → Auth → Add user.

### Milestone 9 — Projects filter bar (committed `e9570be`)
Projects page gains a filter bar between the summary cards and the status tabs: **live name search**, **customer dropdown**, **site-code dropdown** (from `project_sites` + sites) — combined with **AND** logic and the existing status tabs, which now show **per-status result counts**.

---

## ✅ Current state (verified 2026-08)

- `npm test` → **193/193 passing** (14 files)
- `npx tsc --noEmit` → clean (test files are inside `src`, so they're typechecked too)
- `npm run build` → succeeds (pre-existing chunk-size warning only, unrelated)
- HEAD: `50356c0` — **everything pushed to `origin/main`** (Vercel auto-deploys; commit email `fjakoba@gmail.com` matches the GitHub account so deployments aren't blocked).
- Access model is now **grant-based (CEO-only)** — see Milestone 13 below. `ROLE_PERMISSIONS` is GONE from `src/types`; roles are labels only (DB RLS still role-scoped).
- Finance automation + Supply/Trading projects — see **Milestone 14** below; auto-create Project from a received PO — see **Milestone 15** below (migrations 014–021 **all applied on the live DB**).
- Milestone 10 changed: `src/App.tsx`, `src/contexts/AuthContext.tsx` (+`.test.tsx`), `src/components/auth/` (LoginPage + test), `src/components/layout/Header.tsx`, `database/schema.sql`, `schema.sql`; new `database/migrations/012_auth_rls.sql`
- Milestone 8 changed: `src/components/crud/EntityFormModal.tsx` + `.test.tsx`, `src/lib/hooks/useEntityCrud.tsx`, `src/lib/api/entityConfigs.ts` + `.test.ts`, `src/lib/evm.ts` + `.test.ts`, `src/modules/controls/EVMModule.tsx`
- Milestone 6 changed: `database/schema.sql`, `schema.sql`, `src/lib/api/entityConfigs.ts`, `src/lib/evm.ts` + `.test.ts`, `src/modules/controls/EVMModule.tsx`, `src/types/index.ts`; new `database/migrations/011_add_evm_po.sql`
- `git status` (Milestone 5): modified `database/schema.sql`, `schema.sql`, `src/components/crud/EntityFormModal.tsx` + `.test.tsx`, `src/lib/api/entityConfigs.ts` + `.test.ts`, `src/lib/evm.ts` + `.test.ts`, `src/lib/formPayload.ts` + `.test.ts`, `src/lib/hooks/useEntityCrud.tsx`, `src/modules/{controls/EVMModule, projects/ProjectsModule}.tsx`, `src/types/index.ts`; untracked `database/migrations/009_add_project_sites.sql`, `database/migrations/010_merge_duplicate_projects.sql`
- Untracked (intentional): `reasonix.toml` (tool config, never commit). `instructions.md` is now committed (2026-08).

### Milestone 13 — Email confirmation + CEO-grant permissions (pushed `d775f06`)

**Email confirmation flow** (works on localhost AND Vercel):
- `src/components/auth/ConfirmPage.tsx` (+ test) at `/auth/confirm`: reads `token_hash`+`type` (query or hash), calls `verifyOtp({ token_hash, type })` (PKCE `?code=` → `exchangeCodeForSession` as fallback), checks URL `error_description` BEFORE trusting a stored session, then **signs the fresh session out** (`{ scope: 'local' }`) so `/login` shows "Email confirmed! You can now sign in." — auto-login (implicit/PKCE via `detectSessionInUrl`) still takes over on the short-circuit path.
- `src/lib/supabase.ts`: client explicitly `{ auth: { detectSessionInUrl: true } }`.
- `TeamModule` invite: `signUp` passes `emailRedirectTo: ${origin}/auth/confirm`.
- `LoginPage`: shows the confirmed banner from navigation state; `email_not_confirmed` errors show actionable guidance + a **"Resend confirmation email"** action (`supabase.auth.resend`, `EMAIL_NOT_CONFIRMED_MESSAGE` shared constant).
- `AuthContext`: stale-session guard — a profile lookup resolving after `SIGNED_OUT`/session-replace no longer resurrects the user (mount path + `onAuthStateChange`).
- `Input` component: optional `revealable` prop — eye toggle beside `type="password"` fields (enabled on the login page).
- `vercel.json`: SPA rewrite (`/(.*)` → `index.html`) so direct loads like `/auth/confirm` from the email work.

**Permission model → grant-based (replaces role-based)**:
- **Only the CEO grants** view/edit per module (`users.permissions`, set in Team → Edit member). Roles no longer imply access — `ROLE_PERMISSIONS` **deleted** from `src/types`. Missing/`'none'` = no access; `'view'` = read-only; `'edit'` = full. **CEO is admin** (full access, unaffected by grants on their row).
- **`team` is now a grantable module** (matrix, `App.tsx` route guard, Sidebar item, `TABLE_MODULE.users`, `HOME_PATHS`) — a Manager can be denied Team access.
- **Users-table writes are CEO-only in the UI** (invite/edit/delete), matching RLS `users_write_admin` (CEO-only) — non-CEO `team` access is a read-only roster; nobody can self-grant or set the CEO role.
- **Edit/delete enforcement**: `useEntityCrud` gates `openCreate`/`openEdit`/`create`/`update`/`remove` behind `canEdit(TABLE_MODULE[table])` and now returns `editable`; modules hide New/Edit/Delete buttons for non-editors (Projects module done; others opt in the same way). `TABLE_MODULE` (entityConfigs) maps table → permission-module key, mirroring App.tsx route guards.
- **Zero-grant users**: land on a "No modules have been granted…" screen with Sign out (`Home` in App.tsx; `firstAllowedPath` falls back to `/` — no /login loop).

**Pushing / Vercel**: HTTPS + PAT only (see Git notes); commit email must match a GitHub account (see Git notes).

---

### Milestone 14 — Finance automation + Supply/Trading projects (pushed `bcd4c87`)

**Finance module (`FinanceModule.tsx` + `lib/financeWorkflows.ts`):**
- Status-driven automation via the inline status selects: invoice **paid** → auto Payment for the remaining amount (tagged `Auto —`, removed when leaving paid, create-before-flip so a failure can't leave a phantom paid invoice); quote **accepted** → auto PO (status `sent`); PO **received** → auto Invoice (status `draft`, due +30d). Deduped via `hasAutoDoc` (source number in notes), race-guarded by `statusBusy`, collision-safe numbers (`nextNumberFor`, `PO-YYYYMMDD-NN`).
- Inline status selects on Quotes and POs (like Invoices); inline payment Method select; clickable rows with detail modals; customer + per-tab status filters.
- **Line-items editor** (`lineItems` field type in EntityFormModal + `formPayload`): Designation/Qty/Unit/Unit-price rows, derived subtotal/tax/total (cleared rate zeroes tax; POs keep manual tax).

**Projects — Supply/Trading business line (`project_type`, migration 019):**
- `project_type` (`telecom_service` default | `supply_trading`), delivery fields, `project_supply_items` goods table (**migration 019 RUN on the live DB**). New schema tables must be registered in `TABLES`/`FIELD_CONFIGS` or the entityConfigs invariant test fails.
- New Project shows a **type picker**; supply projects use a custom modal (`SupplyProjectModal` in ProjectsModule.tsx): common + delivery fields, goods table (Code/Desc/Unit/Qty/Purchase/Selling/Margin-per-unit/Total, fixed widths), **From Quote** pre-fill (name = quote number, customer, items with codes 1..n, selling price from the quote), customer dropdown from the companies module.
- Save writes back `budget = totalCost` (BAC), `spent = totalCost` (AC — **not 0**, both create and edit), `revenue = totalSelling` (PO); margin = PO − AC. Modal **closes on save**; progress **auto-100% when completed**; exact prices everywhere (`fmt` never abbreviates to "3.3M").
- Cards: 📡/📦 badge, delivery row for supply (status/items/PO ref), type filter, summary breakdown by type, supply detail view (goods + EVM). Telecom path untouched (PhaseTimeline/syncSites).
- `useSupplyItems` hook loads/saves goods lines (delete+insert, non-atomic like `syncSites`).

---

### Milestone 15 — Auto-create Project from a received PO (revised per user 2026-08: delivery type on Quote, trigger on PO received)

**Delivery type lives on the Quote** (`quotes.delivery_type`, single-select **`ASP` | `SUPPLY`**, no default) and **follows the chain**: quote → PO (`poFromAcceptedQuote`) → Invoice (`invoiceFromReceivedPo`) → Payment (`autoPaymentForPaid`) — each derived record inherits it, and it's shown in all four detail modals. The PO form no longer offers the choice (it's not editable there — migration 021).

**Trigger** (`FinanceModule.maybeCreateProjectFromPo`): whenever a PO is `status = received` **and** carries a delivery type — fires regardless of which field changed last (inline status select AND modal create/edit, via `onCreated`/`onUpdated`):
- **SUPPLY** → a **supply_trading** project, populated per `auto-project.md`: customer ← PO (vendor = client in this ERP), name = PO number, `po_reference` = PO number, start = received date, end = +30d, delivery deadline = +15d, delivery status **pending**, goods lines from every Quote linked to the PO (`quote_id` or notes; no quote → project still created, without goods lines), purchase price 0 → budget/spent 0, revenue = total selling.
- **ASP** → a **telecom_service** project: same customer / PO reference / dates, no goods lines, revenue = the PO total.

**Idempotent**: the auto Project stores the PO number in `projects.po_reference`; the trigger re-checks that link with a fresh DB read before inserting, so re-saving never duplicates.

**Atomicity**: `insert_project_with_goods(jsonb, jsonb)` (migration 020) inserts the Project + its `project_supply_items` rows in **one transaction** via `supabase.rpc` (security invoker — RLS still applies). **Migrations 019 + 020 + 021 RUN on the live DB.**

**Project form:** Customer Contact in `SupplyProjectModal` is a Select **restricted to Contacts of the selected customer** (was free text); legacy free-text values survive an edit. Auto-created projects leave it blank (POs/Quotes have no contact field).

**Tests:** `financeWorkflows.test.ts` covers delivery-type inheritance (quote→PO→invoice→payment) and both project paths (SUPPLY+received → supply/trading w/ goods lines; ASP+received → telecom_service; no delivery type / not received → nothing) → **184/184**, `tsc` clean, build green.

**Bugfix (migration 022):** `insert_project_with_goods` originally cast `jsonb → text[]` for the `team` column, which doesn't exist in Postgres — plpgsql only fails at first execution, so the PO-received trigger died with "cannot cast type jsonb to text[]" and blocked BOTH the auto-Invoice and the auto-Project. Fixed with `jsonb_array_elements_text`; `changePoStatus` also now creates the Invoice BEFORE the Project so one failure can never block the other. **Run 021 + 022 on the live DB** (021 adds `delivery_type` to quotes/invoices/payments — required for the inherited field to save).

**Assumptions:** "PO status = Accepted" from the original `auto-project.md` was superseded by the user's explicit trigger on **PO received**; `accepted` remains a legal PO status (harmless); project name = PO number; no contact field added to POs/Quotes ("if any" branch → blank); no unique index on `po_reference` (app-level idempotency check only, matching `hasAutoDoc` style).

---

### Milestone 16 — Scope of Work section on telecom projects (per `SOW.md`)

**Fields** (projects table, migration 023 — **NOT yet run on live DB**):
- `scope_build_type` select `NSB` | `MOD` and `scope_technology` select `RAN` | `MW` — the two top-level selectors
- `scope_nsb_ran_items` **text[]** multi-select (`ANTENNA, RRU, FO, RACK, BASEBAND`) — NSB+RAN
- `scope_nsb_mw_dish_size` select dish size (`0.3m…3m`) — NSB+MW
- `scope_mod_ran_add_items` + `scope_mod_ran_swap_items` **text[]** (both `RRU, ANTENNA, RACK, BASEBAND`) — MOD+RAN (independent ADD & SWAP groups)
- `scope_mod_mw_swap_dish_size` select dish size — MOD+MW (SWAP only)

**UI** (`EntityFormModal` + `entityConfigs.projects`): checkbox groups are the existing `multiSelect` field type, now with **static `options` support** (previously lookup-only) storing **text[] columns** (codebase convention, like `projects.team`). New `FieldConfig.showWhen(values)` + `section` props: sub-fields render only once BOTH selectors have a value; `pruneConditional` drops the values of now-hidden conditional fields on every selector change **and** on modal open, so stale sub-selections are never saved or reloaded; required-validation only counts visible fields. Telecom detail modal shows a Scope of Work summary when set. Supply projects unaffected.

**Tests**: 9 new (6 acceptance checks + 3 `pruneConditional` unit) → **193/193**, `tsc` clean, build green. Acceptance: NSB+RAN → exactly the 5-item checkbox group; NSB+MW → dish dropdown; MOD+RAN → ADD+SWAP together (8 checkboxes); MOD+MW → SWAP dish only; switching selectors clears sub-selections; saved values reload with their section active.

**Assumptions**: multi-select stored as `text[]` array columns (not join table / booleans); field names keep the SOW's `scope_*` snake_case → camelCase app shape (`scopeBuildType`, `scopeNsbRanItems`, …); dish-size options exactly as listed; Build Type + Technology are the first two controls of the section (heading "Scope of Work" rendered above Build Type).

**Follow-up**: dish-size fields render as **click-to-select chips** (`FieldConfig.chips`, no native dropdown — one click, no press-and-hold); the **Region list** was replaced repo-wide with the 22 Madagascar regions (`Antsiranana, Diana, Sava, Analanjirofo, Sofia, Boeny, Melaky, Betsiboka, Alaotra-Mangoro, Analamanga, Vakinankaratra, Bongolava, Itasy, Atsimo-Atsinanana, Atsinanana, Vatovavy-Fitovinany, Amoron’i Mania, Haute Matsiatra, Ihorombe, Androy, Anosy, Menabe`) in `types/index.ts` (`Region`) and `entityConfigs.ts` (`REGIONS`).

---

### Milestone 17 — Site access & transmission fields (per user 2026-08, migration 024 — NOT yet run on live DB)

- `sites.means_of_transport` **text[]** — checkbox multi-select (**4x4, moto, boat, foot**), more than one allowed (replaces the old single-choice `access_type` concept; the column stays for existing data)
- `sites.transport_length_km` numeric — transport leg length in km
- `sites.walk_distance_km` numeric — distance from the end of the 4x4 track to the site (on foot), km
- `sites.transmission_type` select — **MW | VSAT | STARLINK | OF**
- `sites.technology` form input changed from comma-`tags` to **multiSelect checkboxes (2G, 3G, 4G, 5G)** (column unchanged — still text[])
- SitesModule detail modal shows Transmission / Transport (means + length) / Walk-from-4x4 rows
- **Assumptions**: transport options = 4x4/moto/boat/foot; one km field per transport leg (singular "its length"); `access_type` kept; SitesModule filter (`ALL_TECHS`) left broader than the form options.

---

## 🔒 Git / environment notes (IMPORTANT for future sessions)

- **Home directory is READ-ONLY** (container): no `~/.ssh`, no `~/.git-credentials` can be created. SSH to GitHub is impossible; **HTTPS + PAT is the only auth path**.
- **Pushing requires a PAT** each time (token never persisted). Procedure used successfully twice:
  1. Write a throwaway askpass script: `printf '#!/bin/sh\ncase "$1" in\n  *Password*) echo "$GIT_PAT" ;;\n  *) echo "kobajah" ;;\nesac\n' > /tmp/git-askpass.sh && chmod 700 /tmp/git-askpass.sh`
  2. `GIT_PAT='<token>' GIT_ASKPASS=/tmp/git-askpass.sh git push -u origin main`
  3. `rm -f /tmp/git-askpass.sh` — NEVER write the token into `.git/config`, the remote URL, or any file.
- The user has a PAT (`ghp_…`); it may be revoked between sessions — ask for a fresh one when pushing.
- Git identity (repo-local): `Jakoba <fjakoba@gmail.com>` — **must match a GitHub account**: Vercel blocks deployments whose commit email isn't linked to a GitHub account (`f.jakoba@ma-do.mg` caused a block; changed to the GitHub email).
- Writable paths (bind mounts): the repo dir itself and `~/.cache`. `/tmp` is writable (tmpfs).

---

## ✅ Migrations status

**002 + 003: RUN on live DB, verified. 004–021: ALL RUN on live DB** (verified by user 2026-08: 004–020 previously, 021 now). 010 is a review-first data-repair script — **backup first**. 012 locks the core tables behind real auth — deploy the new app build at the same time. 013–017 are auth fixes; 018 switches roles to CEO/Manager/Inspector/Team Leader.

- `002_add_created_at.sql` — RUN, verified (all 7 tables answer `order=created_at`)
- `003_link_columns.sql` — RUN, verified (`site_code`/`site_name`/`project_name` on installation/integration records)
- `004_drop_companies_revenue_add_project_site_revenue.sql` — drops `companies.revenue`; adds `projects.revenue` + `sites.revenue` (`bigint default 0`). **Blocking:** until run, project/site `revenue` fields fail to save and CustomersModule still works off the old column.
- `005_drop_project_code_add_site_id.sql` — drops `projects.code` + `projects.site_ids`; adds `projects.site_id uuid`. **Blocking:** project form's Site picker fails until run; existing projects then have no linked site (must re-pick on edit).
- `006_backfill_fk_ids.sql` — data repair: fills NULL `customer_id`/`company_id`/`vendor_id` from stored name columns (contacts, subcontractors, opportunities, sites, projects, quotes, invoices, boqs, contracts, purchase_orders). Needed so **existing** records show up in customer/company views. Caveat: duplicate company names match arbitrarily.
- `007_drop_site_customer_project_links.sql` — drops `sites.customer_id`/`customer_name`/`project_id`/`project_name` (site keeps only site info; link direction is project → site).
- `008_add_site_distance_km.sql` — adds `sites.distance_km numeric(10,2) default 0` (manual "Distance (km)" field).
- `009_add_project_sites.sql` — creates the `project_sites` junction (project ↔ many sites), **converts existing `projects.site_id` links into it**, drops `projects.site_id`. **Blocking:** the multi-site picker and EVM site chips show nothing until run. Existing single-site links are preserved automatically.
- `010_merge_duplicate_projects.sql` — **review-first, NOT idempotent, BACKUP first**: merges projects duplicated by (name, customer_name) — keeps earliest, unions sites, remaps child rows (all `project_id` tables), collapses duplicate EVM rows, **sums budget/spent/revenue** into the survivor, deletes dupes, `RAISE NOTICE` per merge. Run only after 009. (Fixes committed `c936308`: GROUP BY `customer_name`, `update contracts` not documents, uuid→text casts for `contracts.linked_project_ids`.)
- `011_add_evm_po.sql` — adds `evm_metrics.po bigint default 0` (customer PO). Existing rows get `po = 0` until re-saved through the EVM form.
- `012_auth_rls.sql` — real auth: `app_role()`/`app_has_role()` helpers, `users ↔ auth.users` sync trigger (default role `viewer`), and role-scoped RLS on `users`, `sites`, `projects`, `project_sites`, `tasks`, `evm_metrics`, `companies`, `contacts`, `invoices`, `payments` (matrix mirrors `ROLE_PERMISSIONS`). Other tables keep `allow_all` (phase 2). **Blocking:** the anon key can't read the core tables after this — deploy the login-screen build together. Create the first admin in Supabase → Authentication → Add user (the trigger creates their `users` row on first login).
- `013_seed_admin.sql` — seeds a guaranteed admin (`admin@manongadoria.mg` / `Admin@2026!`, bcrypt; `on conflict do nothing`; DO-block reports created/already-exists/error). ⚠️ change the password after first login.
- `014_fix_auth_hook_select_star.sql` — discovery for `SELECT * FROM public.users` hooks via `prosrc` (the auth-hook theory was wrong — see 015).
- `015_fix_auth_users_tokens.sql` — fills NULL token columns on `auth.users` (fixes `500 POST /token` / "converting NULL to string"); 013 now inserts tokens as `''`.
- `016_fix_users_policy_recursion.sql` — users policies via SECURITY DEFINER `app_has_role` (fixes "infinite recursion detected in policy for relation users").
- `017_add_user_permissions.sql` — `users.permissions jsonb` (per-member None/View/Edit module checklist; Team invite creates the auth account via signUp).
- `018_new_roles.sql` — roles → **CEO/Manager/Inspector/Team Leader**: drop old role CHECK first, migrate old roles (admin→CEO, pm/finance→Manager, engineer→Inspector, viewer→Team Leader), new CHECK + default, recreate sync trigger, re-apply all core RLS with the new names. Departments (Direction/HSE/Logistic/Project) are an app-side dropdown.
- All 004–008 are **idempotent** (drop/add column if exists). 004/005/007 are destructive for the dropped columns (user-approved). The full `database/schema.sql` must **NOT** be run on the live project (it drops tables; the DB has real user data).

---

## 🧪 Test harness (added `6d0f905`, extended 2026-08)

Run: `npm test` (one-shot) / `npm run test:watch`. Config: `vitest.config.ts` (default env `node`, `@` alias matches `vite.config.ts`; component test opts into jsdom via `// @vitest-environment jsdom` docblock).

| File | Coverage |
|---|---|
| `src/lib/api/case.test.ts` | `toCamel`/`toSnake`, round-trips, `keysToCamel` recursion + Date passthrough, `keysToSnake` keeps JSONB payload shapes |
| `src/lib/api/entityConfigs.test.ts` | Parses `database/schema.sql`; guards the **blank-form invariant**: 31 tables with `TABLES` + non-empty `FIELD_CONFIGS`, every non-virtual field key maps to a real snake_case column, valid types (`multiSelect` included), lookups target real tables/columns |
| `src/lib/api/crud.test.ts` | Scripted PostgREST builder over a mocked `@/lib/supabase`: ordering, filter-skipping, `created_at` retry fallback, create/update stripping + snake_casing, error surfacing |
| `src/lib/formPayload.test.ts` | Pure `buildPayload`: number blank-drop / NaN rejection / parse, tags parsing, date normalization, **multiSelect array passthrough**, **`stripVirtualFields`** |
| `src/components/crud/EntityFormModal.test.tsx` | Required-blocking, blank-number drop, date normalization, tags, checkbox default, **lookup auto-population**, **fresh-form-on-reopen**, **multiSelect**, **sitePicker** (deduped project names, dependent site list, data pull, required, edit pre-select) |
| `src/lib/projectFinance.test.ts` | `projectFinance(budget, spent, revenue)`: variance/profit math, budget-consumption traffic light (red >100% / orange 80–100% / green <80%), budget=0 edge cases |
| `src/lib/invoiceStatus.test.ts` | `resolvePaidOnStatusChange`: status `paid` → paid=total; any other status → paid = recorded payments (revert keeps balance accurate) |
| `src/contexts/AuthContext.test.tsx` | Session-based auth: session restore + profile by auth_id, login success/failure, logout, stale-profile-after-sign-out race (signed-out + replaced-user), `can()` **grant-based** gating (no role defaults; CEO full access; view/edit/none grants; CEO unaffected by restrictive grants), `firstAllowedPath` fallback order + `/` fallback — over mocked `supabase.auth` + `makeApi` |
| `src/components/auth/LoginPage.test.tsx` | Login screen: renders fields, submits credentials to `login()`, surfaces auth errors, redirects when already signed in, shows the email-confirmed banner from `/auth/confirm`, **password reveal/hide eye toggle**, **resend-confirmation** action for `email_not_confirmed` (success + failure feedback, no resend for other errors) |
| `src/components/auth/ConfirmPage.test.tsx` | Email confirmation handler: PKCE `?code=` exchange, `token_hash&type=` verifyOtp (query + hash), signs the fresh session out so `/login` shows "Email confirmed!", already-signed-in short-circuit (detectSessionInUrl, no sign-out), URL error beats stale session, verify/exchange failure paths, no-token error |
| `src/lib/hooks/useEntityCrud.test.tsx` | Module-permission gating: create/update/remove/openEdit allowed with `edit`, blocked (no-op, modal never opens) without, unmapped tables not gated |
| `src/lib/hooks/useSupplyItems.test.ts` | Supply/trading goods lines (project_supply_items): load with client-side totals (cost/selling/margin), delete+insert save with empty-row cleaning, no-project no-op, totals math |
| `src/lib/financeWorkflows.test.ts` | Finance automation builders: auto payment (full/partial/zero guards), PO-from-quote / invoice-from-PO mapping (status sent/draft, tax back-derive), auto-tag detection, day-prefixed unique numbering, dedup-by-notes |
| `src/lib/evm.test.ts` | `deriveEVM`; `evFromProgress(bac, pct)`; `appendSnapshot`; `rollupCustomerEVM`; `combineEVMRecords` (sum + re-derive + benefit); `groupEVMByProject` (STARLINK-style grouping, split by customer); `mergeHistories` (same-date sum) |

**Key runtime facts the tests encode:**
- Lookup `valueKey`/`labelKey`/`orderBy`/`populate` values are **camelCase row keys** — rows arrive via `makeApi().list()` already `keysToCamel`'d. Tests snake-case before comparing to schema columns.
- `populate` may target **hidden FK form fields** (e.g. `projectId`, `siteId`) that don't appear in the form — by design (FKs get injected into the save payload).
- **Extend coverage when touching:** hooks (`useEntityCrud`, `useEntity`), dashboards/Kanban logic, more module configs.
- **Permissions**: enforcement lives in `useEntityCrud` (gates CRUD by `TABLE_MODULE[table]` → `canEdit`) — modules hide New/Edit/Delete with the returned `editable` flag.
- **Projects have two business lines** (`project_type`): `telecom_service` (default, sites/phases, generic form) and `supply_trading` (custom supply modal + `project_supply_items` goods table; line totals write back to **budget=BAC, spent=AC=total cost, revenue=PO**). `useSupplyItems` loads/saves goods lines; new schema tables must be registered in `TABLES`/`FIELD_CONFIGS` or the entityConfigs invariant test fails.

---

## 🔧 Fixed — Milestone 1 (committed)

- Hardcoded Supabase creds removed (`src/lib/supabase.ts` fails loudly without env vars; `.env` is git-ignored; user rotated the anon key)
- `created_at` ordering bug (crud.ts retry fallback + schema columns + migration `002` — RUN, verified)
- Generic form: required validation, no empty-numeric→0 coercion, date normalization, create/edit routing
- Modal a11y (Escape/focus/dialog); delete/approve handlers all try/catch with surfaced errors
- Data integrity: stock movements adjust item quantity; payments update invoice `paid`; overdue from `due_date`; Kanban done-reachable; live revenue chart
- **FIELD_CONFIGS keyed by snake_case table names** (was camelCase → blank forms); startup guard warns on missing configs
- **Module linking (lookup feature)**: `FieldConfig.lookup` (table/valueKey/labelKey/labelFormat/populate)

## 🔧 Session 2026-08-03 — Milestone 4 (committed `1faaa0b`)

- **Revenue model**: `companies.revenue` dropped. Customer revenue is **computed** from invoices (`invoiced`/`paid`/`balance`, cancelled excluded) in `CustomersModule.finByCustomer`. Booked revenue: `projects.revenue` + `sites.revenue`.
- **Projects module**: form `Code` → **Site picker** (1:1, `projects.site_id`; `code`/`site_ids` dropped). Cards/detail show linked site, **Variance** (Budget−Spent, traffic light red >100% / orange 80–100% / green <80%) and **Profit** (Revenue−Spent) with colors, **Total Profit** KPI, **Total Spent** KPI now black. **Phase timeline**: circles colored for the current phase and filled by progress (0% empty → 100% full); phases before the current one show completed (green ✓); per-phase records override the inference.
- **Sites module**: customer/project pickers + columns removed (pure site info + description); new **Distance (km)** manual field.
- **Cross-module FK fix (important pattern)**: 9 lookups were saving only denormalized names, never the FK id — added `populate` (`contacts.companyId`, `opportunities/sites/projects/quotes/boqs/contracts.customerId`, `purchase_orders.vendorId`, `subcontractors.companyId`). Without this, every "pull related rows" view was empty. **Rule for future configs: any lookup to `companies`/`projects`/`sites` on a table that HAS the FK column must include `populate`.** (`leads`, `payments`, `evm_metrics` have no FK column → correctly skipped.)
- **Finance module**: status dropdown in the invoices table (no edit modal); `paid` → `paid=total`; leaving `paid` restores `paid` = sum of recorded payments (balance returns). Full CRUD (✏️/🗑️) on all 4 tabs; deleting a payment subtracts it from the invoice's `paid`.
- **EVM module**: was read-only with no way to add rows → now full CRUD + **derived metrics** (enter BAC/PV/EV/AC only; CPI/SPI/SV/CV/EAC/ETC/VAC/TCPI computed via `src/lib/evm.ts`). New optional `transformPayload` hook in `useEntityCrud`. Charts fall back to the current snapshot when no `history` exists.
- **EntityFormModal stale-reset fix**: form now re-seeds on every open (was key-comparison — New→cancel→New kept stale input). 2 regression tests.
- **RBAC**: `pm` role gained `finance` permission (Finance + BOQ + Procurement sidebar entries share the `finance` module key). ARCHITECTURE.md matrix updated.

---

## 🔧 This session — Milestone 5: multi-site projects + grouped EVM (uncommitted)

- **Model restored**: project → **many sites** via new junction table `project_sites(project_id, site_id)` (replaces the 1:1 `projects.site_id` from 005; the old `projects.site_ids text[]` is not coming back). One project = one customer engagement covering many sites.
- **EVM groups per project + customer and lists its sites** — cards and detail show site chips (`MDG-001 — Site Name`; first 2 + "+N more" on cards). One EVM record per project; BAC/PV/EV/AC cover the whole engagement. Snapshots (`history`) + Customer Rollup from the previous pass are unchanged.
- **Generic form**: new `multiSelect` field type (lookup-backed checkbox grid → `string[]`) + `virtual` field config (rendered but excluded from the table payload). `useEntityCrud` strips virtual keys and gained an `onUpdated` hook. Projects' Sites field is a virtual multiSelect; the module rewrites `project_sites` rows via `onCreated`/`onUpdated`.
- **Projects module**: multi-site picker, cards show site codes + Sites count, detail lists Linked Sites (siteId · status · revenue). Edit pre-checks current links (Project rows carry view-model `siteIds`).
- **Tests**: 95/95. EVM pure helpers: `deriveEVM`, `evFromProgress`, `appendSnapshot`, `rollupCustomerEVM`, `combineEVMRecords`, `groupEVMByProject`, `mergeHistories` (all unit-tested).
- **EVM form flow (Milestone 8)**: Project dropdown = **unique names** (one STARLINK) → then pick the **site** (ATS078/ATS169) → PO/BAC/AC/customer pulled from that site's project (`sitePicker` field type + `extraLookup`). One EVM record per site-project; the page combines same-name sites (BACs sum) and each group keeps ≥1 site checked (last checkbox disabled).

---

## 🏗 Architecture facts to remember

- Schema: **30 tables**, nested lists as JSONB in parent rows (line items, ATP results, equipment…). `database/schema.sql` is canonical; root `schema.sql` is a duplicate — **keep in sync** (both edited together every time).
- **No real auth**: demo user-picker over `users` table; RLS is `allow_all` on every table (by design, documented). **Security milestone still open.**
- `keysToCamel`/`keysToSnake` in `src/lib/api/case.ts`; `makeApi().list()` defaults `order_by=created_at` with a retry fallback.
- `src/lib/api/entityConfigs.ts`: `TABLES` (camel → snake) + `FIELD_CONFIGS` keyed by snake_case table names; startup guard warns on missing configs.
- **Link direction is project → many sites** (`project_sites` junction, multi-select in the project form). Sites carry no customer/project columns. Site form fields: siteId, name, region, lat/long, technology, status, priority, tower, power, access, distanceKm, revenue, notes.
- **Revenue/financial model**: customer revenue computed from invoices; `projects.revenue` (booked), `sites.revenue`; Variance = Budget−Spent (traffic light), Profit = Revenue−Spent. `invoices.balance` is a generated column (`total − paid`); `paid` is kept in sync by the payments module and the status dropdown.
- **Pure-math libs** (all unit-tested): `src/lib/projectFinance.ts`, `src/lib/invoiceStatus.ts`, `src/lib/evm.ts` (+ `appendSnapshot`, `rollupCustomerEVM`). `useEntityCrud` supports optional `onCreated`/`onUpdated` (post-save side effects), `transformPayload` (pre-save derivation), and strips `virtual` fields (e.g. the `multiSelect` site links) before insert/update.
- Env: `.env` (git-ignored) holds `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (rotated). Live project: `gwqiikapzpgndxhzkqwj.supabase.co` — **has real user data** (never run full `schema.sql` on it).

---

## 📌 Tomorrow's agenda (priority order)

1. ✅ **Migrations 004 → 018 on the live DB** — DONE (app is live on Vercel; role migration 018 applied). 009 auto-converted single-site links; 010 merged duplicates.
2. ✅ **After 012**: Email provider enabled, first admin created, app deployed.
3. ✅ **Push Milestones 9–13** — all on `origin/main` (commit email `fjakoba@gmail.com` so Vercel isn't blocked).
4. **RLS phase 2** (still open): role-scope the remaining tables (leads, opportunities, quotes, purchase_orders, boqs, contracts, survey/installation/integration/atp, inventory, procurement, assets, resources, documents, subcontractors, …) — note the frontend matrix is grant-based now, but DB RLS is still role-scoped.
5. ✅ **Deploy**: Vercel, both env vars set.
6. Optional follow-ups the user may want (ask before doing):
   - **Line-items editor** for invoices/quotes/POs (JSONB `items` has no form UI; user deferred this earlier — shows empty items in detail modal).
   - Extend test coverage: hooks (`useEntityCrud`/`useEntity`), dashboards, Kanban logic.
   - Make dashboard **Total Cost** use `projects.spent` instead of `evm_metrics.ac` (user asked what it was; flagged the EVM-data dependency as a caveat).
   - Mobile PWA / GIS / AI roadmap items (see ARCHITECTURE.md).

## Data caveats to communicate to the user

- After `006`, existing contacts/invoices/etc. get FK ids backfilled by **name match** — re-verify if duplicate company names exist.
- Existing projects lose `code` and `site_ids` (005) — site must be re-picked on edit; the code was only ever displayed in the Projects module.
- `evm_metrics` previously could only be populated via SQL — existing rows (if any) may have 0/null derived metrics until re-saved through the new form.
- `010` merges duplicate project rows by name + customer and **sums budget/spent/revenue** into the survivor — read the `RAISE NOTICE` output and verify after running. **Backup before running.**

---

## Commands

- Dev: `npm run dev` (port 5173)
- Build: `npm run build` (tsc + vite.config check + vite)
- Typecheck: `npx tsc --noEmit`
- Tests: `npm test` / `npm run test:watch`
- Git identity: repo-local `Jakoba <fjakoba@gmail.com>` (must match the GitHub account for Vercel); remote `origin` = HTTPS `https://github.com/kobajah/Manongaerp.git`
