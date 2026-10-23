-- Team Inbox online dots. One row per person, stamped whenever their
-- dashboard checks the inbox; recently seen people show as online. Only the
-- service role reads or writes it. Additive and data-preserving.
begin;

create table if not exists public.team_presence (
  org_id uuid not null,
  user_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.team_presence enable row level security;
revoke all on public.team_presence from anon, authenticated;
grant all on public.team_presence to service_role;

commit;
