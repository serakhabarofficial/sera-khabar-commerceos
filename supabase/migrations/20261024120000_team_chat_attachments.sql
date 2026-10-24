-- Team Inbox photos, documents and voice messages. Files live in the private
-- team-attachments bucket under {org}/{channel}/{author}/; browsers upload
-- them with one-time signed URLs and read them with short-lived signed URLs,
-- both issued by the server. A message may now be only attachments, so its
-- text can be empty. Messages and their attachments are saved together by
-- team_chat_post_message. Only the service role reads or writes these.
-- Additive and data-preserving.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-attachments',
  'team-attachments',
  false,
  20971520,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv', 'text/plain',
    'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Text stays trimmed and under 4000 characters; empty is allowed now.
alter table public.team_messages drop constraint if exists team_messages_body_check;
alter table public.team_messages add constraint team_messages_body_check
  check (char_length(body) <= 4000 and body = btrim(body));

create table if not exists public.team_message_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  message_id uuid not null references public.team_messages(id) on delete cascade,
  position smallint not null check (position between 0 and 9),
  kind text not null check (kind in ('image', 'file', 'voice')),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  width integer check (width is null or width between 1 and 20000),
  height integer check (height is null or height between 1 and 20000),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 600000),
  created_at timestamptz not null default now(),
  unique (message_id, position)
);

alter table public.team_message_attachments enable row level security;
revoke all on public.team_message_attachments from anon, authenticated;
grant all on public.team_message_attachments to service_role;

-- One message and its attachments, or neither. A reused id raises 23505 so
-- the server can return the message it already saved.
create or replace function public.team_chat_post_message(
  p_id uuid, p_org uuid, p_channel uuid, p_author uuid, p_body text, p_order_numbers text[], p_attachments jsonb
)
returns public.team_messages
language plpgsql
set search_path = public
as $$
declare
  saved public.team_messages;
  files jsonb := coalesce(p_attachments, '[]'::jsonb);
begin
  if p_body = '' and jsonb_array_length(files) = 0 then
    raise exception 'A message needs text or an attachment' using errcode = '23514';
  end if;
  insert into team_messages (id, org_id, channel_id, author_id, body, order_numbers)
  values (coalesce(p_id, gen_random_uuid()), p_org, p_channel, p_author, p_body, coalesce(p_order_numbers, '{}'))
  returning * into saved;
  insert into team_message_attachments (org_id, message_id, position, kind, storage_path, file_name, mime_type, size_bytes, width, height, duration_ms)
  select p_org, saved.id, (file.ord - 1)::smallint, file.value->>'kind', file.value->>'storage_path', file.value->>'file_name',
    file.value->>'mime_type', (file.value->>'size_bytes')::integer, (file.value->>'width')::integer,
    (file.value->>'height')::integer, (file.value->>'duration_ms')::integer
  from jsonb_array_elements(files) with ordinality as file(value, ord);
  return saved;
end;
$$;

revoke all on function public.team_chat_post_message(uuid, uuid, uuid, uuid, text, text[], jsonb) from public, anon, authenticated;
grant execute on function public.team_chat_post_message(uuid, uuid, uuid, uuid, text, text[], jsonb) to service_role;

-- A message that is only attachments previews as "Photo", "Voice message" or
-- its first file's name.
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
    coalesce(nullif(last.body, ''), (
      select case a.kind when 'image' then 'Photo' when 'voice' then 'Voice message' else a.file_name end
      from team_message_attachments a where a.message_id = last.id order by a.position limit 1
    )),
    last.author_id, last.created_at
  from team_channels c
  join team_channel_members me on me.channel_id = c.id and me.user_id = p_user
  left join lateral (
    select m.id, m.body, m.author_id, m.created_at from team_messages m
    where m.channel_id = c.id order by m.created_at desc limit 1
  ) last on true
  where c.org_id = p_org;
$$;

revoke all on function public.team_chat_summaries(uuid, uuid) from public, anon, authenticated;
grant execute on function public.team_chat_summaries(uuid, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
