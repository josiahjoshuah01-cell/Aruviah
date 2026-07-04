-- admin_users: database-driven admin role table
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

-- RLS: deny all public access — only service-role can read/write
alter table public.admin_users enable row level security;

-- No policies = no public access. Service-role bypasses RLS by default.
