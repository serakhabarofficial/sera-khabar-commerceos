-- Team Inbox channels become members-only. A row in team_channel_members now
-- means "is in this channel" for channels as well as DMs. Everyone already
-- on the team is added to every existing channel, so nobody loses a
-- conversation they could read before. Summaries only list conversations
-- the person belongs to. Additive and data-preserving.
begin;

insert into public.team_channel_members (channel_id, org_id, user_id)
select c.id, c.org_id, r.user_id
from public.team_channels c
join public.user_roles r on r.org_id = c.org_id and r.deleted_at is null
where c.kind = 'channel'
on conflict (channel_id, user_id) do nothing;

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
  join team_channel_members me on me.channel_id = c.id and me.user_id = p_user
  left join lateral (
    select m.body, m.author_id, m.created_at from team_messages m
    where m.channel_id = c.id order by m.created_at desc limit 1
  ) last on true
  where c.org_id = p_org;
$$;

revoke all on function public.team_chat_summaries(uuid, uuid) from public, anon, authenticated;
grant execute on function public.team_chat_summaries(uuid, uuid) to service_role;

commit;
