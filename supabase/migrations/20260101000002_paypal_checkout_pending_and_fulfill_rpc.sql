-- Pending checkout metadata (create-order → capture/webhook safety net)
create table paypal_checkout_pending (
  paypal_order_id text primary key,
  user_id uuid not null references auth.users(id),
  items jsonb not null,
  shipping jsonb,
  shipping_country text not null,
  created_at timestamptz default now()
);

alter table paypal_checkout_pending enable row level security;

-- Atomic order + items + stock (service_role only)
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
      product_id uuid,
      qty int,
      price numeric
    )
  loop
    insert into order_items (order_id, product_id, qty, price)
    values (v_order_id, item.product_id, item.qty, item.price);

    if not decrement_stock(item.product_id, item.qty) then
      raise exception 'insufficient stock for product %', item.product_id;
    end if;

    perform increment_sold_count(item.product_id, item.qty);
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
