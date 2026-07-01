-- Product variants, reviews, order_items → variant_id

-- ---------------------------------------------------------------------------
-- product_variants
-- ---------------------------------------------------------------------------
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  cj_variant_id text,
  color text,
  size text,
  sku text unique not null,
  price_usd numeric(10,2) not null check (price_usd >= 0),
  shipping_cost_usd numeric(10,2) not null default 0 check (shipping_cost_usd >= 0),
  stock int not null default 0,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create index product_variants_product_id_idx on product_variants (product_id);
create index product_variants_cj_variant_id_idx
  on product_variants (cj_variant_id)
  where cj_variant_id is not null;

alter table product_variants enable row level security;

create policy "Public can view active variants"
  on product_variants for select
  using (
    is_active = true
    and exists (
      select 1 from products p
      where p.id = product_variants.product_id and p.is_active = true
    )
  );

-- Migrate existing products → one variant each (16 real CJ products)
insert into product_variants (
  product_id,
  cj_variant_id,
  color,
  size,
  sku,
  price_usd,
  shipping_cost_usd,
  stock,
  image_url,
  is_active
)
select
  id,
  cj_variant_id,
  null,
  null,
  sku,
  price_usd,
  0,
  stock,
  image_url,
  is_active
from products;

-- ---------------------------------------------------------------------------
-- order_items: product_id → variant_id
-- ---------------------------------------------------------------------------
alter table order_items add column variant_id uuid references product_variants(id);

update order_items oi
set variant_id = pv.id
from product_variants pv
where pv.product_id = oi.product_id;

alter table order_items drop column product_id;
alter table order_items alter column variant_id set not null;

-- ---------------------------------------------------------------------------
-- products: listing-level only (price/stock/sku/cj_variant_id → variants)
-- ---------------------------------------------------------------------------
drop index if exists products_cj_variant_id_idx;

alter table products
  drop column if exists price_usd,
  drop column if exists stock,
  drop column if exists sku,
  drop column if exists cj_variant_id;

-- image_url retained as cover/listing card; cj_product_id retained on products

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
create table reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now(),
  unique (user_id, product_id, order_id)
);

create index reviews_product_id_idx on reviews (product_id);

alter table reviews enable row level security;

create policy "Public can read reviews"
  on reviews for select
  using (true);

create policy "Verified buyers can insert reviews"
  on reviews for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from orders o
      join order_items oi on oi.order_id = o.id
      join product_variants pv on pv.id = oi.variant_id
      where o.id = reviews.order_id
        and o.user_id = auth.uid()
        and o.status in ('paid', 'shipped')
        and pv.product_id = reviews.product_id
    )
  );

-- ---------------------------------------------------------------------------
-- Stock RPCs: variants + product sold_count
-- ---------------------------------------------------------------------------
drop function if exists decrement_stock(uuid, int);

create or replace function decrement_stock(p_variant_id uuid, p_qty int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  rows_affected int;
begin
  update product_variants
  set stock = stock - p_qty
  where id = p_variant_id and stock >= p_qty;
  get diagnostics rows_affected = row_count;
  return rows_affected > 0;
end;
$$;

revoke all on function decrement_stock(uuid, int) from public;
grant execute on function decrement_stock(uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- fulfill_paid_order: variant_id line items
-- ---------------------------------------------------------------------------
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
      price numeric
    )
  loop
    insert into order_items (order_id, variant_id, qty, price)
    values (v_order_id, item.variant_id, item.qty, item.price);

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

comment on table product_variants is 'Sellable SKU/variant row — price, stock, shipping, CJ vid live here';
comment on table reviews is 'One review per user per product per order; insert requires paid/shipped purchase proof';
