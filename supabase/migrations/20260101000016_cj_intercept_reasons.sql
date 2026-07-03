-- CJ createOrderV2 intercept reasons (stock, delisted, etc.) — raw JSON preserved for admin review.
alter table orders
  add column if not exists cj_intercept_reasons jsonb;

comment on column orders.cj_intercept_reasons is
  'Raw interceptOrderReasons array from CJ createOrderV2 when order is blocked despite HTTP 200';

create index if not exists orders_cj_intercept_reasons_idx
  on orders ((cj_intercept_reasons is not null))
  where cj_intercept_reasons is not null;
