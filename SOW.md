# Implementation Prompt — Scope of Work Section (Project Module, Telecom Sites)

## Role & Ground Rules
You are a senior developer with full read/write access to our existing business management system's Project module. Complete this task — investigation, implementation, and verification — in a single pass, without pausing to ask questions. Where a requirement below is ambiguous, pick the most reasonable option consistent with the existing codebase, implement it, and note the assumption in your closing summary.

**Before writing any code**, inspect the repository to see how Project fields, checkbox/multi-select groups, and conditional/dynamic form sections are already implemented elsewhere in the app, and match that convention rather than introducing a new UI pattern.

**Do not change or break anything outside this feature's scope.**

## 1. Overview
Add a "Scope of Work" section to the Project record for telecom site projects. It has two top-level selectors that determine which sub-fields appear below them:
- **Build Type**: `NSB` (New Site Build) or `MOD` (Modification) — single choice
- **Technology**: `RAN` or `MW` — single choice

None of the fields in section 2 are shown until both selectors have a value.

## 2. Conditional Field Sets

**NSB + RAN** → multi-select checkboxes:
`ANTENNA`, `RRU`, `FO`, `RACK`, `BASEBAND`

**NSB + MW** → single-select dropdown, dish size:
`0.3m`, `0.6m`, `0.9m`, `1.2m`, `1.8m`, `2.4m`, `3m`

**MOD + RAN** → two independent multi-select checkbox groups shown together:
- ADD: `RRU`, `ANTENNA`, `RACK`, `BASEBAND`
- SWAP: `RRU`, `ANTENNA`, `RACK`, `BASEBAND`
(Both groups can have selections at the same time — e.g. an RRU added and an Antenna swapped in the same modification.)

**MOD + MW** → single-select dropdown, dish size (SWAP only — no ADD option for MW under MOD):
`0.3m`, `0.6m`, `0.9m`, `1.2m`, `1.8m`, `2.4m`, `3m`

## 3. Data Model (suggested — adapt to existing conventions)
| Field | Type | Applies when | Options |
|---|---|---|---|
| `scope_build_type` | select | always | NSB, MOD |
| `scope_technology` | select | always | RAN, MW |
| `scope_nsb_ran_items` | multi-select | build_type=NSB, technology=RAN | ANTENNA, RRU, FO, RACK, BASEBAND |
| `scope_nsb_mw_dish_size` | select | build_type=NSB, technology=MW | 0.3m, 0.6m, 0.9m, 1.2m, 1.8m, 2.4m, 3m |
| `scope_mod_ran_add_items` | multi-select | build_type=MOD, technology=RAN | RRU, ANTENNA, RACK, BASEBAND |
| `scope_mod_ran_swap_items` | multi-select | build_type=MOD, technology=RAN | RRU, ANTENNA, RACK, BASEBAND |
| `scope_mod_mw_swap_dish_size` | select | build_type=MOD, technology=MW | 0.3m, 0.6m, 0.9m, 1.2m, 1.8m, 2.4m, 3m |

Use whichever multi-select representation is already standard in this codebase (tag/array field, join table, or one boolean per option) — pick one and apply it consistently across all three multi-select groups above.

## 4. UI Behavior
- Render Build Type and Technology as the first two controls in the Scope of Work section.
- Only render the matching field set from section 2 once both selectors have a value; switching either one should update the visible fields immediately.
- Changing Build Type or Technology after sub-fields were filled must clear the now-irrelevant sub-field values, not just hide them while leaving stale data saved underneath.

## 5. Constraints
- Leave everything outside this feature untouched.
- Match existing code style, field-naming, and form-validation conventions.

## 6. Acceptance Checks
1. NSB + RAN shows exactly the 5-item checkbox group and nothing else from section 2.
2. NSB + MW shows exactly the dish-size dropdown.
3. MOD + RAN shows both the ADD and SWAP checkbox groups simultaneously.
4. MOD + MW shows exactly the (SWAP) dish-size dropdown.
5. Switching Build Type or Technology after choosing sub-values clears the previous sub-selections instead of leaving orphaned data.
6. Saved Project records correctly persist and reload the selected values, including which conditional section was active.

## Deliverable
Implement the schema and UI changes directly. Finish with a short summary: files/fields touched, the actual field/model names used if different from the suggestions above, and how the multi-select groups were implemented (array field / join table / booleans).
Commit, push and update handoff 
