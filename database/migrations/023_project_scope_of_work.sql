-- 023: Scope of Work section on telecom site projects.
-- Two top-level selectors (build type, technology) gate the conditional
-- sub-fields. Multi-select groups are stored as text[] columns (the codebase
-- convention for checkbox groups, e.g. projects.team). All idempotent; safe
-- on the live DB.

alter table public.projects add column if not exists scope_build_type text
  check (scope_build_type in ('NSB','MOD'));

alter table public.projects add column if not exists scope_technology text
  check (scope_technology in ('RAN','MW'));

-- NSB + RAN → checkbox group: ANTENNA, RRU, FO, RACK, BASEBAND
alter table public.projects add column if not exists scope_nsb_ran_items text[] default '{}';

-- NSB + MW → single-select dish size: 0.3m..3m
alter table public.projects add column if not exists scope_nsb_mw_dish_size text;

-- MOD + RAN → two checkbox groups (ADD and SWAP): RRU, ANTENNA, RACK, BASEBAND
alter table public.projects add column if not exists scope_mod_ran_add_items text[] default '{}';
alter table public.projects add column if not exists scope_mod_ran_swap_items text[] default '{}';

-- MOD + MW → single-select dish size (SWAP only): 0.3m..3m
alter table public.projects add column if not exists scope_mod_mw_swap_dish_size text;
