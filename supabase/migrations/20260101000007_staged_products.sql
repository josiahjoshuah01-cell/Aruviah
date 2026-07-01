-- CJ staging: products await admin review before going live.

create table staged_products (
  id uuid primary key default gen_random_uuid(),
  cj_product_id text not null,
  title text not null,
  description text,
  cost_price_usd numeric(10,2) not null check (cost_price_usd >= 0),
  suggested_price_usd numeric(10,2) not null check (suggested_price_usd >= 0),
  image_url text,
  suggested_category_id uuid references categories(id),
  variants jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  search_keyword text,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create index staged_products_status_idx on staged_products (status);
create index staged_products_cj_product_id_idx on staged_products (cj_product_id);
create unique index staged_products_pending_cj_pid_idx
  on staged_products (cj_product_id)
  where status = 'pending';

alter table staged_products enable row level security;

-- Intentionally no select/insert/update policies for anon or authenticated roles.
-- Only the service role (server-side scripts + admin actions) may access this table.
