-- Persist CJ unit cost on live variants, snapshot at sale, and backfill from staging.

alter table product_variants
  add column if not exists cost_price_usd numeric(10, 2) check (cost_price_usd is null or cost_price_usd >= 0);

comment on column product_variants.cost_price_usd is
  'CJ supplier unit cost (USD) — admin/internal only, never exposed to customers';

alter table order_items
  add column if not exists cost_price_usd numeric(10, 2) check (cost_price_usd is null or cost_price_usd >= 0);

comment on column order_items.cost_price_usd is
  'Unit cost snapshotted at purchase time for margin reporting';

-- Backfill live variant costs from approved staging rows (staging is retained on approve).
update product_variants pv
set cost_price_usd = matched.cost
from (
  select distinct on (pv2.id)
    pv2.id as variant_id,
    (elem->>'cost_price_usd')::numeric as cost
  from product_variants pv2
  inner join products p on p.id = pv2.product_id
  inner join staged_products sp
    on sp.cj_product_id = p.cj_product_id
    and sp.status = 'approved'
  cross join lateral jsonb_array_elements(sp.variants) as elem
  where p.cj_product_id is not null
    and pv2.cj_variant_id is not null
    and pv2.cj_variant_id = elem->>'cj_variant_id'
    and pv2.cost_price_usd is null
    and elem ? 'cost_price_usd'
    and (elem->>'cost_price_usd') ~ '^[0-9]+(\.[0-9]+)?$'
    and (elem->>'cost_price_usd')::numeric >= 0
  order by pv2.id, sp.created_at desc
) matched
where pv.id = matched.variant_id;

-- fulfill_paid_order: snapshot cost_price_usd on each line item
create or replace function fulfill_paid_order(
  p_user_id uuid,
  p_paypal_order_id text,
  p_total numeric,
  p_shipping jsonb,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  item record;
  v_product_id uuid;
begin
  select id into v_order_id
  from orders
  where paypal_order_id = p_paypal_order_id;

  if found then
    return v_order_id;
  end if;

  insert into orders (user_id, total, currency, status, paypal_order_id, shipping)
  values (p_user_id, p_total, 'USD', 'paid', p_paypal_order_id, p_shipping)
  returning id into v_order_id;

  for item in
    select *
    from jsonb_to_recordset(p_items) as x(
      variant_id uuid,
      qty int,
      price numeric,
      cost_price_usd numeric
    )
  loop
    insert into order_items (order_id, variant_id, qty, price, cost_price_usd)
    values (
      v_order_id,
      item.variant_id,
      item.qty,
      item.price,
      item.cost_price_usd
    );

    if not decrement_stock(item.variant_id, item.qty) then
      raise exception 'insufficient stock for variant %', item.variant_id;
    end if;

    select product_id into v_product_id
    from product_variants
    where id = item.variant_id;

    perform increment_sold_count(v_product_id, item.qty);
  end loop;

  return v_order_id;
exception
  when unique_violation then
    select id into v_order_id
    from orders
    where paypal_order_id = p_paypal_order_id;
    return v_order_id;
end;
$$;

revoke all on function fulfill_paid_order(uuid, text, numeric, jsonb, jsonb) from public;
grant execute on function fulfill_paid_order(uuid, text, numeric, jsonb, jsonb) to service_role;
