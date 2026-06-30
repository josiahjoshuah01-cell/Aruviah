-- Aruviah initial schema

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  sort_order int not null default 0
);

create table products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id),
  title text not null,
  description text,
  price_usd numeric(10,2) not null check (price_usd >= 0),
  image_url text,
  sku text unique not null,
  stock int not null default 0,
  sold_count int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create index products_category_idx on products(category_id);
create index products_title_search_idx on products using gin (to_tsvector('english', title));

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  total numeric(10,2) not null,
  currency text not null default 'USD',
  status text not null default 'pending',
  paypal_order_id text unique,
  shipping jsonb not null,
  created_at timestamptz default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade not null,
  product_id uuid references products(id) not null,
  qty int not null check (qty > 0),
  price numeric(10,2) not null
);

alter table categories enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create policy "Public can view categories"
  on categories for select using (true);

create policy "Public can view active products"
  on products for select using (is_active = true);

create policy "Users can view own orders"
  on orders for select using (auth.uid() = user_id);

create policy "Users can insert own orders"
  on orders for insert with check (auth.uid() = user_id);

create policy "Users can view own order items"
  on order_items for select using (
    exists (select 1 from orders where orders.id = order_items.order_id and orders.user_id = auth.uid())
  );

-- Stock management RPCs (service role only)
create or replace function decrement_stock(p_product_id uuid, p_qty int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  rows_affected int;
begin
  update products
  set stock = stock - p_qty
  where id = p_product_id and stock >= p_qty;
  get diagnostics rows_affected = row_count;
  return rows_affected > 0;
end;
$$;

create or replace function increment_sold_count(p_product_id uuid, p_qty int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update products
  set sold_count = sold_count + p_qty
  where id = p_product_id;
end;
$$;

revoke all on function decrement_stock from public;
revoke all on function increment_sold_count from public;
