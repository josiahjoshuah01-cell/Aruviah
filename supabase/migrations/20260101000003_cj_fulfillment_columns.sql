-- CJ Dropshipping catalog mapping + order tracking + status enum

alter table products
  add column if not exists cj_product_id text,
  add column if not exists cj_variant_id text;

create index if not exists products_cj_variant_id_idx
  on products (cj_variant_id)
  where cj_variant_id is not null;

alter table orders
  add column if not exists cj_order_id text;

-- Document allowed order statuses (no prior check constraint existed)
alter table orders drop constraint if exists orders_status_check;

alter table orders add constraint orders_status_check check (
  status in (
    'pending',
    'paid',
    'paid_needs_manual_fulfillment',
    'paid_fulfillment_pending',
    'fulfilling',
    'shipped',
    'refunded',
    'failed'
  )
);

comment on column products.cj_product_id is 'CJ product ID (pid) — NULL until catalog import maps a real CJ product';
comment on column products.cj_variant_id is 'CJ variant ID (vid) — required for CJ order API; NULL for synthetic ARV-* SKUs';
comment on column orders.cj_order_id is 'CJ order ID returned by createOrderV3 on successful API fulfillment';
