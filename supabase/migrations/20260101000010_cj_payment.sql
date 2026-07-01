-- CJ wallet payment tracking (distinct from customer-facing order.status).

alter table orders
  add column if not exists cj_payment_status text not null default 'not_required'
    check (cj_payment_status in ('unpaid', 'paid', 'not_required')),
  add column if not exists cj_shipment_order_id text,
  add column if not exists cj_pay_id text,
  add column if not exists cj_order_amount_usd numeric(12, 2);

comment on column orders.cj_payment_status is
  'CJ wallet payment: unpaid after createOrderV2, paid after payBalanceV2, not_required when CJ order was never created.';

create table if not exists admin_settings (
  id int primary key default 1 check (id = 1),
  cj_auto_pay_enabled boolean not null default false,
  cj_auto_pay_daily_cap_usd numeric(12, 2) not null default 100,
  updated_at timestamptz not null default now()
);

insert into admin_settings (id) values (1)
on conflict (id) do nothing;

alter table admin_settings enable row level security;

create table if not exists cj_auto_pay_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  cj_shipment_order_id text,
  amount_usd numeric(12, 2) not null default 0,
  outcome text not null check (outcome in ('success', 'failed', 'cap_blocked')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists cj_auto_pay_logs_created_at_idx
  on cj_auto_pay_logs (created_at desc);

create index if not exists cj_auto_pay_logs_order_id_idx
  on cj_auto_pay_logs (order_id);

create index if not exists orders_cj_payment_status_idx
  on orders (cj_payment_status)
  where cj_payment_status = 'unpaid';

alter table cj_auto_pay_logs enable row level security;

-- Existing CJ orders created before this migration still need wallet payment.
update orders
set cj_payment_status = 'unpaid'
where cj_order_id is not null
  and cj_payment_status = 'not_required';
