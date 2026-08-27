# Plan: MS Project–style Gantt + Import for TelecomERP Task Board

## Context (paste these files for the AI before starting)
- `src/components/.../GanttView.tsx` — existing Gantt renderer (React/TS, Tailwind)
- `src/lib/taskTimeline.ts` — date/dependency/grouping helpers
- `src/types/index.ts` (or wherever `Task` lives) — data model
- Stack: React + TypeScript + Vite + Tailwind + Supabase, deployed at manongaerp.vercel.app

## Current state (already working — don't rebuild these)
- Gantt bars with progress fill, derived from `status` (backlog/todo/in_progress/review/done)
- Dependency connectors (SVG), including a red/dashed style for violated links
- Grouping by project, collapsible groups, "Unscheduled Tasks" band
- Month/Week/Day zoom, "Today" marker, overdue flag, priority accent color
- Warning styles for missing/invalid dates

## Gaps to close, in order

### 1. Task creation/edit form — Gantt-relevant fields
Confirm the existing "New Task" / edit form exposes all Gantt-relevant `Task` fields:
- `startDate`, `dueDate` (date pickers, not just due date)
- `dependencies: string[]` — multi-select of other tasks in the same project, prevent selecting the task itself
- `estimatedHours` / `loggedHours`
- `phase`, `priority`, `assigneeId`
If any of these are missing from the form, add them. Dependency multi-select should filter to tasks in the same `projectId` to keep lists short.

### 2. Dependency cycle / integrity guard on save
`taskTimeline.ts` already exports `findDependencyCycles()` and `findMissingDependencies()` — **not currently called from the UI**. Wire them in:
- On task save, run `findDependencyCycles()` on the would-be updated task list; block save and show which tasks form the cycle if one is introduced.
- On the Gantt tab load, run `findMissingDependencies()` and show a dismissible banner listing tasks with dangling dependency ids (data cleanup, e.g. after a task delete).

### 3. Milestones (visual parity with MS Project diamonds)
`Task` has no `isMilestone` flag today. Add one:
- Schema: `is_milestone boolean default false` column on `tasks` table (Supabase migration) + `isMilestone?: boolean` on the `Task` type.
- Form: checkbox "Milestone" — when checked, hide `estimatedHours`/duration inputs, force `dueDate = startDate` (zero-length).
- `GanttView.tsx`: render milestone bars as a diamond (rotated square, `w-3 h-3 rotate-45`) instead of the rounded bar, centered on `startDay`.

### 4. Critical path (optional but closes a common MS Project ask)
- Add a pure function in `taskTimeline.ts`: `computeCriticalPath(tasks): Set<string>` — standard forward/backward pass on the dependency DAG using each task's `dayCount` as duration, only meaningful once #2's cycle guard is in place (a cyclic graph breaks CPM).
- `GanttView.tsx`: toggle button "Show critical path" → bars/edges on the critical path render in a distinct color (e.g. red outline) when enabled.

### 5. MS Project CSV import (the main ask)
**UI**
- Button "Import from MS Project" on the Task Board header, opens a modal.
- Modal: file input (`.csv`), a short instructions block (see Export steps below), a project picker if not already scoped to one project, a phase picker (single phase applied to the whole batch, or a column-driven mapping if the export includes one).
- After parsing: preview table (Task Name, Start, Finish, Status derived, Assignee resolved/unresolved, Predecessors resolved/unresolved) before committing.
- Confirm button inserts into Supabase `tasks` table; show a summary toast (`N tasks imported, M dependencies unresolved`).

**Export steps from MS Project (put these in the modal's help text)**
1. File → Save As → "CSV (Comma delimited) (*.csv)"
2. Export Wizard → "Selected data" → Task mapping
3. Include columns: `ID`, `Task Name`, `Start`, `Finish`, `% Complete`, `Predecessors`, `Resource Names`

**Parsing logic**
- CSV parser handling quoted fields with embedded commas.
- Date parser: MS Project's CSV date format varies by Windows locale (`d/m/yyyy` vs `m/d/yyyy`); make the locale a config toggle, don't hardcode.
- `% Complete` → nearest of the 5 fixed status buckets used by `STATUS_PROGRESS` in `taskTimeline.ts` (0/0/50/75/100) — there's no free percent field on `Task`.
- `Predecessors` column (e.g. `"3,5FS+2 days"`) → strip the `FS+2 days` lag/type suffix (not supported by the current schema — see #6 if you want it), keep only the row numbers, resolve them to generated task UUIDs in a second pass (build a map of MS-Project-row-id → generated-id in pass 1, resolve deps in pass 2).
- `Resource Names` → look up against the Team module by name; first name becomes `assigneeId`/`assigneeName`, any extra names get appended as a note in `description` (don't drop them silently).
- Milestones: rows with `Duration = 0` (if that column is included) → set `isMilestone = true` from #3.
- Skip summary/blank rows (no `ID` or no `Task Name`).

**Output**
- Array of `Task` objects with real generated UUIDs, ready for `supabase.from('tasks').insert(tasks)`.
- A separate list of unresolved dependencies/assignees to surface in the preview, not fail the whole import.

### 6. (Optional, later) Dependency lag support
If exact MS Project fidelity matters (FS+2 days, SS, FF types):
- Schema: change `dependencies: string[]` to `dependencies: { taskId: string; type: 'FS'|'SS'|'FF'|'SF'; lagDays: number }[]` — **breaking change**, needs a data migration for existing tasks (wrap old string ids as `{ taskId, type: 'FS', lagDays: 0 }`).
- Update `buildDependencyEdges()`, the cycle/critical-path functions, and the connector rendering to account for lag when computing violated/critical status.
- Only do this if plain FS links aren't good enough — it touches every dependency-related function.

## Suggested build order
1. Task form fields (#1) — quick win, unblocks manual testing of everything else.
2. Cycle/missing-dependency guards (#2) — safety net before more data flows in.
3. MS Project CSV import (#5) — the actual deliverable requested.
4. Milestones (#3) — visual polish, moderate effort.
5. Critical path (#4) — nice-to-have, depends on #2.
6. Lag support (#6) — only if #5's simplification proves insufficient in practice.

## Acceptance checklist
- [ ] Can manually create a task with start date, due date, dependencies, and see it render correctly in the Gantt (bar position, connector lines)
- [ ] Saving a task that would create a dependency cycle is blocked with a clear error
- [ ] "Import from MS Project" accepts a real MS Project CSV export and produces a correct preview
- [ ] Imported tasks appear in the Gantt grouped under the right project, with dependency connectors matching the original MS Project predecessor links
- [ ] Milestones render as diamonds, not bars
- [ ] Unresolved dependencies/assignees from an import are visible to the user, not silently dropped
