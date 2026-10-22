-- Call log for the order editor. One row per phone call between a team member
-- and a customer: who called whom, whether the customer picked up, how long
-- they talked, and what the customer said. Rows start when someone clicks Call
-- (or MicroSIP reports a call) and are finished by MicroSIP's call events.
-- MicroSIP authenticates with a per-staff key; only its hash is stored.
-- Additive and data-preserving.
begin;

create table if not exists public.order_calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid references public.orders(id) on delete cascade,
  staff_id uuid not null,
  direction text not null check (direction in ('outgoing', 'incoming')),
  phone text not null check (phone ~ '^01[0-9]{9}$'),
  outcome text not null default 'ringing' check (outcome in ('ringing', 'answered', 'no_answer')),
  source text not null default 'click' check (source in ('click', 'microsip', 'manual')),
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  said_code text check (said_code is null or said_code in ('confirmed', 'send_later', 'call_later', 'address_change', 'order_change', 'refused', 'cancel')),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_calls_org_order_started_idx
on public.order_calls (org_id, order_id, started_at desc);

create index if not exists order_calls_org_staff_started_idx
on public.order_calls (org_id, staff_id, started_at desc);

drop trigger if exists update_order_calls_updated_at on public.order_calls;
create trigger update_order_calls_updated_at
before update on public.order_calls
for each row execute function public.update_updated_at_column();

alter table public.order_calls enable row level security;
revoke all on public.order_calls from anon, authenticated;
grant all on public.order_calls to service_role;

create table if not exists public.call_helper_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists call_helper_keys_one_active_per_user
on public.call_helper_keys (org_id, user_id) where revoked_at is null;

alter table public.call_helper_keys enable row level security;
revoke all on public.call_helper_keys from anon, authenticated;
grant all on public.call_helper_keys to service_role;

commit;
