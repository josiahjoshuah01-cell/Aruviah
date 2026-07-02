-- Local tracking for CJ disputes filed via admin.

create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  cj_dispute_id text,
  cj_order_id text not null,
  status text not null default 'Pending',
  reason text,
  expect_type int check (expect_type in (1, 2)),
  refund_amount numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists disputes_order_id_idx on disputes (order_id);
create index if not exists disputes_cj_dispute_id_idx on disputes (cj_dispute_id)
  where cj_dispute_id is not null;

alter table disputes enable row level security;

comment on table disputes is
  'CJ disputes filed from admin; synced from CJ via getDisputeList/getDisputeDetail.';
