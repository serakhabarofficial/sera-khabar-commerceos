-- Order Board: a manual kanban tab in Orders. The merchant names the lists
-- (Reschedule, VIP, Heavy Parcels, ...), pulls any order onto a list, writes a
-- note and an optional reminder date, and drags cards between lists. Nothing
-- here is touched by courier sync or webhooks. One card per order.
-- Additive and data-preserving.
begin;

create table if not exists public.order_board_lists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text not null default 'slate' check (color in ('amber', 'rose', 'violet', 'blue', 'teal', 'slate', 'green')),
  position double precision not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_board_lists_org_position_idx
on public.order_board_lists (org_id, position);

create table if not exists public.order_board_cards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  list_id uuid not null references public.order_board_lists(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 2000),
  remind_on date,
  position double precision not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_board_cards_one_per_order unique (org_id, order_id)
);

create index if not exists order_board_cards_org_list_position_idx
on public.order_board_cards (org_id, list_id, position);

create table if not exists public.order_board_updates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  card_id uuid not null references public.order_board_cards(id) on delete cascade,
  staff_id uuid,
  kind text not null check (kind in ('added', 'moved', 'note')),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists order_board_updates_org_card_created_idx
on public.order_board_updates (org_id, card_id, created_at desc);

drop trigger if exists update_order_board_lists_updated_at on public.order_board_lists;
create trigger update_order_board_lists_updated_at
before update on public.order_board_lists
for each row execute function public.update_updated_at_column();

drop trigger if exists update_order_board_cards_updated_at on public.order_board_cards;
create trigger update_order_board_cards_updated_at
before update on public.order_board_cards
for each row execute function public.update_updated_at_column();

alter table public.order_board_lists enable row level security;
alter table public.order_board_cards enable row level security;
alter table public.order_board_updates enable row level security;
revoke all on public.order_board_lists from anon, authenticated;
revoke all on public.order_board_cards from anon, authenticated;
revoke all on public.order_board_updates from anon, authenticated;
grant all on public.order_board_lists to service_role;
grant all on public.order_board_cards to service_role;
grant all on public.order_board_updates to service_role;

commit;
