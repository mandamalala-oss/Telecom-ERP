# Implementation Prompt — Auto-Create Project from Financial Module (SUPPLY + PO Accepted)

## Role & Ground Rules
You are a senior developer with full read/write access to our existing business management system (covering Financial, Project, Customer, and Quote/PO data). Complete this task — investigation, implementation, and verification — in a single pass, without pausing to ask questions. Where a requirement below is ambiguous, pick the most reasonable option consistent with the existing codebase, implement it, and note the assumption in your closing summary.

**Before writing any code**, inspect the repository to confirm the real models/tables/fields for: the PO and its status field, Quotes and their line items, Customer and Contact records (and how Contacts relate to a Customer), and the Project record. Match the existing naming conventions, ORM/framework, and automation style (hooks, observers, workflow/server actions, etc.) already used in the codebase — don't introduce a new pattern.

**Do not change or break anything outside this feature's scope.** If you spot clearly broken or buggy code in files you touch while building this, fix it — don't refactor unrelated code.

## 1. New Field — Financial Module
Add a single-select field on the Financial record that also carries the PO status (so both can be read together):
- Suggested name: `delivery_type` (rename to match existing conventions if there's a clearer fit)
- Options: `ASP`, `SUPPLY`
- No default selection, unless the schema requires one for select fields

## 2. Automation Trigger
Whenever, on the same PO/Financial record:
- `delivery_type = SUPPLY`, **and**
- PO `status = Accepted`

...automatically create one new **Project** record. Fire this regardless of which condition became true last — i.e. also trigger if `delivery_type` is switched to SUPPLY after the PO was already Accepted, not only when status flips to Accepted first.

- **Idempotent**: link every auto-created Project back to its source PO, and check for that link before creating another. Never duplicate a Project for the same PO.
- If the condition isn't met, do nothing.

## 3. Auto-Created Project — Data Mapping
The fields below (Customer Contact, PO Reference, Start/End Date, Delivery Date, Delivery Status, Goods Lines) are assumed to already exist on the Project model — this task is about populating them automatically. If any genuinely don't exist yet, add them following existing Project field conventions.

| Project Field | Source | Rule |
|---|---|---|
| Customer | Financial/PO record | Same customer as the source record |
| Customer Contact | Customer Module → Contacts | Selectable options must always be restricted to Contacts linked to the Project's Customer. For the auto-created Project specifically: pre-fill with the contact already recorded on the source PO/Quote, if any; otherwise leave blank for manual selection |
| PO Reference | Finance Module → PO | Link to (or store the reference of) the exact PO that triggered the creation |
| Start Date | PO acceptance date | Date the PO's status changed to Accepted (use a tracked timestamp if one exists; otherwise the date of the triggering event) |
| End Date | Start Date + 30 calendar days | Calculated |
| Delivery Date | PO acceptance date + 15 calendar days | Calculated |
| Delivery Status | — | Default to **Pending** |
| Goods Lines | Line items of the Quote linked to the PO | One Project goods line per Quote line — Designation/Description ← Quote line's Designation/Description; Unit ← Quote line's Unit; Quantity ← Quote line's Quantity; Selling ← Quote line's Unit Price |

Notes:
- If more than one Quote is linked to the source PO, pull goods lines from all of them.
- If no Quote is linked, still create the Project, just without goods lines — don't fail the whole operation.
- Create the Project and its goods lines inside a single transaction.

## 4. Constraints
- Leave everything outside this feature untouched.
- Match existing code style, validation, and naming conventions.

## 5. Acceptance Checks (confirm before finishing)
1. `delivery_type = ASP`, status → Accepted → no Project created.
2. `delivery_type = SUPPLY`, status ≠ Accepted → no Project created.
3. `delivery_type = SUPPLY`, status → Accepted → exactly one Project created, correctly populated per the table above.
4. Re-saving the same record afterward does not create a second Project.
5. Existing Financial, Project, Customer, and Quote features still behave as before.

## Deliverable
Implement the changes directly in the codebase. Finish with a short summary covering: files changed, the actual field/model names used (if adapted from the suggestions above), and any assumptions made on ambiguous points.
