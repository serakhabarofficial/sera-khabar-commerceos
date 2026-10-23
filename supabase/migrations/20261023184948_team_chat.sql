-- Team Inbox: internal chat between Sera Khabar staff. Channels everyone in
-- the workspace can read, and direct messages between two people. Messages
-- remember the order numbers they mention (SK-1042) so the inbox can show
-- them as order cards. Members rows hold each person's read position and
-- when they last typed. Only the service role reads or writes these tables.
-- Additive and data-preserving.
begin;

create table if not exists public.team_channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  kind text not null check (kind in ('channel', 'dm')),
  name text check (name is null or name ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  topic text check (topic is null or char_length(topic) <= 200),
  -- The two member ids, sorted and joined with ':', so a pair has one DM.
  dm_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check ((kind = 'channel' and name is not null and dm_key is null) or (kind = 'dm' and name is null and dm_key is not null))
);

create unique index if not exists team_channels_org_name_key
on public.team_channels (org_id, name) where kind = 'channel';

create unique index if not exists team_channels_org_dm_key
on public.team_channels (org_id, dm_key) where kind = 'dm';

create table if not exists public.team_channel_members (
  channel_id uuid not null references public.team_channels(id) on delete cascade,
  org_id uuid not null,
  user_id uuid not null,
  last_read_message_id uuid,
  last_read_at timestamptz,
  typing_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists team_channel_members_org_user_idx
on public.team_channel_members (org_id, user_id);

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  channel_id uuid not null references public.team_channels(id) on delete cascade,
  author_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  order_numbers text[] not null default '{}' check (cardinality(order_numbers) <= 10),
  created_at timestamptz not null default now()
);

create index if not exists team_messages_channel_created_idx
on public.team_messages (channel_id, created_at desc);

create table if not exists public.team_message_reactions (
  message_id uuid not null references public.team_messages(id) on delete cascade,
  org_id uuid not null,
  user_id uuid not null,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

alter table public.team_channels enable row level security;
alter table public.team_channel_members enable row level security;
alter table public.team_messages enable row level security;
alter table public.team_message_reactions enable row level security;
revoke all on public.team_channels, public.team_channel_members, public.team_messages, public.team_message_reactions from anon, authenticated;
grant all on public.team_channels, public.team_channel_members, public.team_messages, public.team_message_reactions to service_role;

-- One row per conversation the user can see: every channel, plus the DMs
-- they belong to. Unread counts messages from others after their read mark.
create or replace function public.team_chat_summaries(p_org uuid, p_user uuid)
returns table (channel_id uuid, unread integer, last_body text, last_author uuid, last_at timestamptz)
language sql
stable
set search_path = public
as $$
  select c.id,
    (select count(*)::integer from team_messages m
      where m.channel_id = c.id and m.author_id <> p_user
        and m.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)),
    last.body, last.author_id, last.created_at
  from team_channels c
  left join team_channel_members me on me.channel_id = c.id and me.user_id = p_user
  left join lateral (
    select m.body, m.author_id, m.created_at from team_messages m
    where m.channel_id = c.id order by m.created_at desc limit 1
  ) last on true
  where c.org_id = p_org and (c.kind = 'channel' or me.user_id is not null);
$$;

revoke all on function public.team_chat_summaries(uuid, uuid) from public, anon, authenticated;
grant execute on function public.team_chat_summaries(uuid, uuid) to service_role;

commit;
