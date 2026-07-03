-- Store quoted checkout totals for drift checks at capture
alter table paypal_checkout_pending
  add column if not exists quote jsonb;
