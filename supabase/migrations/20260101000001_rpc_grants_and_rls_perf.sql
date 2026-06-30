-- Lock stock RPCs to service_role only (server-side capture route)
revoke execute on function public.decrement_stock(uuid, int) from anon, authenticated, public;
revoke execute on function public.increment_sold_count(uuid, int) from anon, authenticated, public;
grant execute on function public.decrement_stock(uuid, int) to service_role;
grant execute on function public.increment_sold_count(uuid, int) to service_role;

-- RLS perf: wrap auth.uid() in subselect
drop policy if exists "Users can view own orders" on orders;
create policy "Users can view own orders"
  on orders for select using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own orders" on orders;
create policy "Users can insert own orders"
  on orders for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view own order items" on order_items;
create policy "Users can view own order items"
  on order_items for select using (
    exists (
      select 1 from orders
      where orders.id = order_items.order_id
        and orders.user_id = (select auth.uid())
    )
  );
