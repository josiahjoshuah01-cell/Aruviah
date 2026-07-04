-- Idempotency log for CJ webhook deliveries
create table if not exists public.cj_webhook_events (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  type text not null,
  message_type text,
  received_at timestamptz not null default now(),
  processed boolean not null default false,
  raw_payload jsonb not null
);

create index cj_webhook_events_message_id_idx on cj_webhook_events (message_id);

alter table cj_webhook_events enable row level security;
-- No policies = no public access. Service-role bypasses RLS.
