-- Track when transactional emails were sent (idempotency guard)
alter table public.orders
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists shipped_email_sent_at timestamptz;
