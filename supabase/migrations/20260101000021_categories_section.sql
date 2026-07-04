-- Display-grouping label for mega-menu nav (not a hierarchy; categories stay flat).
alter table public.categories
  add column if not exists section text;

comment on column public.categories.section is
  'Optional mega-menu section header label (e.g. Fashion, Home & Living). NULL = unassigned (shown under More in nav).';
