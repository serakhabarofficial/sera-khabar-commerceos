-- Server-only reservations. Each linked resource retains its own durable alias
-- row: adding a conversion link never moves/deletes the old reservation key.
-- All callers MUST begin_write before mutations and end_write in finally.
-- Operations renew while the server is working. Ten minutes is crash recovery
-- grace, not a maximum handler duration. External requests must also be bounded.
-- Link creation must happen inside the source's begin_write/end_write window,
-- and a new order must be inserted with its link, before becoming addressable.
begin;

create table public.order_handling_leases (
  org_id uuid not null,
  resource_key text not null check (resource_key ~ '^(order|abandoned|review):[0-9a-f-]{36}$'),
  handler_user uuid,
  handler_session uuid,
  activity_at timestamptz,
  heartbeat_at timestamptz,
  busy_user uuid,
  busy_session uuid,
  busy_operation uuid,
  busy_until timestamptz,
  primary key (org_id, resource_key),
  check ((handler_user is null and handler_session is null and activity_at is null and heartbeat_at is null)
    or (handler_user is not null and handler_session is not null and activity_at is not null and heartbeat_at is not null)),
  check ((busy_user is null and busy_session is null and busy_operation is null and busy_until is null)
    or (busy_user is not null and busy_session is not null and busy_operation is not null and busy_until is not null))
);
create index order_handling_operation_idx on public.order_handling_leases(org_id, busy_operation)
  where busy_operation is not null;
alter table public.order_handling_leases enable row level security;
revoke all on public.order_handling_leases from public, anon, authenticated, service_role;
grant select, insert, update on public.order_handling_leases to service_role;

-- Internal graph resolver. Internal attempt vertices connect either direction
-- of the review/attempt/order links. Never link by phone or customer identity.
-- Every edge validates BOTH endpoint workspaces, including legacy weak FKs.
create function public.order_handling_resource_keys(p_org uuid, p_kind text, p_id uuid)
returns text[] language sql volatile security invoker set search_path = ''
as $$
  with recursive edges(a,b) as (
    select 'order:' || o.id, 'abandoned:' || a.id
    from public.orders o join public.abandoned_checkouts a on a.org_id=o.org_id
      and (o.abandoned_checkout_id=a.id or o.abandoned_draft_key_hash=encode(sha256(convert_to(a.draft_key::text,'UTF8')),'hex'))
    where o.org_id=p_org
    union
    select 'review:' || r.id, 'abandoned:' || a.id
    from public.order_protection_reviews r join public.abandoned_checkouts a on a.org_id=r.org_id
      and (r.abandoned_checkout_id=a.id or r.abandoned_draft_key_hash=encode(sha256(convert_to(a.draft_key::text,'UTF8')),'hex'))
    where r.org_id=p_org
    union
    select 'order:' || o.id, 'attempt:' || t.id
    from public.orders o join public.order_risk_attempts t on t.org_id=o.org_id
      and (o.risk_attempt_id=t.id or t.order_id=o.id)
    where o.org_id=p_org
    union
    select 'review:' || r.id, 'attempt:' || t.id
    from public.order_protection_reviews r join public.order_risk_attempts t on t.org_id=r.org_id
      and (r.attempt_id=t.id or t.review_id=r.id)
    where r.org_id=p_org
  ), walk(k) as (
    select p_kind || ':' || p_id
    union
    select case when e.a=w.k then e.b else e.a end
    from walk w join edges e on e.a=w.k or e.b=w.k
  )
  select array_agg(k order by case split_part(k,':',1) when 'order' then 0 when 'abandoned' then 1 else 2 end,k)
  from walk where k not like 'attempt:%';
$$;
revoke all on function public.order_handling_resource_keys(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.order_handling_resource_keys(uuid,text,uuid) to service_role;

-- Copy reservations onto every newly linked alias in the link transaction.
-- This also fences a detached/deleted source after conversion. Existing alias
-- rows are never renamed. Merging independently owned live groups is rejected.
create function public.order_handling_link_aliases()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  keys text[];
  handler public.order_handling_leases%rowtype;
  busy public.order_handling_leases%rowtype;
  stamp timestamptz;
  kind text;
begin
  kind:=case tg_table_name when 'orders' then 'order' when 'order_protection_reviews' then 'review' else 'attempt' end;
  perform pg_advisory_xact_lock(hashtextextended('order-handling:' || new.org_id,0));
  stamp:=clock_timestamp();
  keys:=public.order_handling_resource_keys(new.org_id,kind,new.id);
  if coalesce(cardinality(keys),0)<2 then return new; end if;
  select * into handler from public.order_handling_leases l where l.org_id=new.org_id and l.resource_key=any(keys)
    and least(l.activity_at+interval '5 minutes',l.heartbeat_at+interval '60 seconds')>stamp order by l.resource_key limit 1;
  select * into busy from public.order_handling_leases l where l.org_id=new.org_id and l.resource_key=any(keys)
    and l.busy_until>stamp order by l.resource_key limit 1;
  if exists(select 1 from public.order_handling_leases l where l.org_id=new.org_id and l.resource_key=any(keys) and (
    (least(l.activity_at+interval '5 minutes',l.heartbeat_at+interval '60 seconds')>stamp
      and (l.handler_user is distinct from handler.handler_user or l.handler_session is distinct from handler.handler_session))
    or (l.busy_until>stamp and l.busy_operation is distinct from busy.busy_operation)
  )) or (handler.handler_user is not null and busy.busy_user is not null
    and (handler.handler_user<>busy.busy_user or handler.handler_session<>busy.busy_session)) then
    raise exception 'Cannot link resources reserved by different handlers or operations' using errcode='55P03';
  end if;
  if handler.handler_user is null and busy.busy_user is null then return new; end if;
  insert into public.order_handling_leases(org_id,resource_key,handler_user,handler_session,activity_at,heartbeat_at,
    busy_user,busy_session,busy_operation,busy_until)
  select new.org_id,k,handler.handler_user,handler.handler_session,handler.activity_at,handler.heartbeat_at,
    busy.busy_user,busy.busy_session,busy.busy_operation,busy.busy_until from unnest(keys) k order by k
  on conflict(org_id,resource_key) do update set handler_user=excluded.handler_user,handler_session=excluded.handler_session,
    activity_at=excluded.activity_at,heartbeat_at=excluded.heartbeat_at,busy_user=excluded.busy_user,busy_session=excluded.busy_session,
    busy_operation=excluded.busy_operation,busy_until=excluded.busy_until;
  return new;
end;
$$;
revoke all on function public.order_handling_link_aliases() from public, anon, authenticated;
grant execute on function public.order_handling_link_aliases() to service_role;
create trigger order_handling_order_links after insert or update of abandoned_checkout_id,abandoned_draft_key_hash,risk_attempt_id
  on public.orders for each row
  when (new.abandoned_checkout_id is not null or new.abandoned_draft_key_hash is not null or new.risk_attempt_id is not null)
  execute function public.order_handling_link_aliases();
create trigger order_handling_review_links after insert or update of abandoned_checkout_id,abandoned_draft_key_hash,attempt_id
  on public.order_protection_reviews for each row
  when (new.abandoned_checkout_id is not null or new.abandoned_draft_key_hash is not null or new.attempt_id is not null)
  execute function public.order_handling_link_aliases();
create trigger order_handling_attempt_links after insert or update of order_id,review_id
  on public.order_risk_attempts for each row when (new.order_id is not null or new.review_id is not null)
  execute function public.order_handling_link_aliases();

create function public.order_handling(
  p_org uuid, p_user uuid, p_session uuid, p_resources jsonb, p_action text,
  p_active boolean default false, p_operation uuid default null
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  item jsonb;
  resource_id uuid;
  resource_kind text;
  keys text[] := '{}';
  stamp timestamptz;
  lease public.order_handling_leases%rowtype;
  handler_alive boolean;
  operation_alive boolean;
  owner_name text;
  operation_id uuid;
  result jsonb;
  result_status text;
  holder_user uuid;
  expiry timestamptz;
begin
  if p_org is null or p_user is null or p_session is null or p_active is null
    or p_action is null or p_action not in ('acquire','heartbeat','status','release','begin_write','end_write','renew_write')
    or p_resources is null or jsonb_typeof(p_resources) <> 'array' then
    raise exception 'Invalid handling request' using errcode='22023';
  end if;
  if jsonb_array_length(p_resources)>500
    or (p_action in ('acquire','heartbeat','status','release') and jsonb_array_length(p_resources)<>1)
    or (p_action='begin_write' and jsonb_array_length(p_resources)=0)
    or (p_action in ('end_write','renew_write') and p_operation is null) then
    raise exception 'Invalid handling resources or operation' using errcode='22023';
  end if;
  if not exists(select 1 from public.user_roles where org_id=p_org and user_id=p_user and deleted_at is null) then
    raise exception 'Workspace member not found' using errcode='P0002';
  end if;
  -- Short transaction mutex, shared across instances. It also serializes absent
  -- rows, which SELECT FOR UPDATE alone cannot protect. No external work runs
  -- inside this transaction. Sorted alias writes below keep lock order stable.
  perform pg_advisory_xact_lock(hashtextextended('order-handling:' || p_org,0));
  stamp := clock_timestamp();
  for item in select value from jsonb_array_elements(p_resources) loop
    resource_kind := item->>'kind';
    if jsonb_typeof(item)<>'object' or resource_kind is null or resource_kind not in ('order','abandoned','review')
      or jsonb_typeof(item->'id') is distinct from 'string' then
      raise exception 'Invalid handling resource' using errcode='22023';
    end if;
    begin
      resource_id := (item->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid resource id' using errcode='22023';
    end;
    if p_action in ('end_write','renew_write') then continue; end if;
    if not (
      (resource_kind='order' and exists(select 1 from public.orders where org_id=p_org and id=resource_id))
      or (resource_kind='abandoned' and exists(select 1 from public.abandoned_checkouts where org_id=p_org and id=resource_id))
      or (resource_kind='review' and exists(select 1 from public.order_protection_reviews where org_id=p_org and id=resource_id))
    ) then
      raise exception 'Handling resource not found' using errcode='P0002';
    end if;
    keys := keys || public.order_handling_resource_keys(p_org,resource_kind,resource_id);
  end loop;
  -- Token cleanup deliberately does not resolve records: a conversion/delete
  -- may have removed the source. It clears every alias claimed by this token.
  if p_action='renew_write' then
    update public.order_handling_leases set busy_until=stamp+interval '10 minutes'
    where org_id=p_org and busy_user=p_user and busy_session=p_session and busy_operation=p_operation and busy_until>stamp;
    return jsonb_build_object('success',found,'operation',p_operation,'status','available','holder',null,'expires_at',null);
  elsif p_action='end_write' then
    update public.order_handling_leases set busy_user=null,busy_session=null,busy_operation=null,busy_until=null
    where org_id=p_org and busy_user=p_user and busy_session=p_session and busy_operation=p_operation;
    return jsonb_build_object('success',true,'operation',p_operation,'status','available','holder',null,'expires_at',null);
  end if;
  select array_agg(distinct k order by k) into keys from unnest(keys) k;

  if p_action='release' then
    -- Navigation release clears handling only. The in-flight operation survives.
    update public.order_handling_leases set handler_user=null,handler_session=null,activity_at=null,heartbeat_at=null
    where org_id=p_org and resource_key=any(keys) and handler_user=p_user and handler_session=p_session;
  end if;

  -- Find any blocking alias BEFORE making claims. Busy operations block even
  -- their own session's next begin_write, preventing double courier/SMS sends.
  select * into lease from public.order_handling_leases l
  where l.org_id=p_org and l.resource_key=any(keys) and (
    (l.busy_until>stamp and (p_action='begin_write' or l.busy_user<>p_user or l.busy_session<>p_session))
    or (least(l.activity_at+interval '5 minutes',l.heartbeat_at+interval '60 seconds')>stamp
      and (l.handler_user<>p_user or l.handler_session<>p_session))
  ) order by l.resource_key limit 1;
  if found then
    if lease.busy_until>stamp then
      holder_user:=lease.busy_user; expiry:=lease.busy_until;
    else
      holder_user:=lease.handler_user;
      expiry:=least(lease.activity_at+interval '5 minutes',lease.heartbeat_at+interval '60 seconds');
    end if;
    select coalesce(nullif(btrim(display_name),''),'Team member') into owner_name
      from public.user_roles where org_id=p_org and user_id=holder_user and deleted_at is null;
    return jsonb_build_object('success',false,'status','view_only','holder',jsonb_build_object('name',coalesce(owner_name,'Team member')),'expires_at',expiry);
  end if;

  -- Existing handling can be extended only while BOTH clocks are still live.
  select * into lease from public.order_handling_leases l
  where l.org_id=p_org and l.resource_key=any(keys) and l.handler_user=p_user and l.handler_session=p_session
    and least(l.activity_at+interval '5 minutes',l.heartbeat_at+interval '60 seconds')>stamp
  order by l.resource_key limit 1;
  handler_alive := found;
  select exists(select 1 from public.order_handling_leases l where l.org_id=p_org and l.resource_key=any(keys) and l.busy_until>stamp) into operation_alive;

  if (p_action='acquire' and (not operation_alive or handler_alive)) or (p_action='heartbeat' and handler_alive) then
    -- Copy original activity to new linked aliases; passive heartbeats must not
    -- turn a conversion into user activity. Only explicit acquire/active resets.
    insert into public.order_handling_leases(org_id,resource_key,handler_user,handler_session,activity_at,heartbeat_at)
    select p_org,k,p_user,p_session,
      case when p_action='acquire' or p_active then stamp else lease.activity_at end,stamp
    from unnest(keys) k order by k
    on conflict(org_id,resource_key) do update set handler_user=excluded.handler_user,handler_session=excluded.handler_session,
      activity_at=excluded.activity_at,heartbeat_at=excluded.heartbeat_at;
    handler_alive:=true;
    lease.activity_at:=case when p_action='acquire' or p_active then stamp else lease.activity_at end;
    lease.heartbeat_at:=stamp;
  end if;
  if p_action='begin_write' then
    operation_id:=coalesce(p_operation,gen_random_uuid());
    -- Token reuse must never let one finally block release another operation.
    if exists(select 1 from public.order_handling_leases where org_id=p_org and busy_operation=operation_id and busy_until>stamp) then
      raise exception 'Operation token is already in use' using errcode='22023';
    end if;
    insert into public.order_handling_leases(org_id,resource_key,busy_user,busy_session,busy_operation,busy_until)
    select p_org,k,p_user,p_session,operation_id,stamp+interval '10 minutes' from unnest(keys) k order by k
    on conflict(org_id,resource_key) do update set busy_user=excluded.busy_user,busy_session=excluded.busy_session,
      busy_operation=excluded.busy_operation,busy_until=excluded.busy_until;
  end if;
  if handler_alive then
    result_status:='handling'; holder_user:=p_user;
    expiry:=least(lease.activity_at+interval '5 minutes',lease.heartbeat_at+interval '60 seconds');
  elsif operation_alive then
    result_status:='view_only';
    select busy_user,busy_until into holder_user,expiry from public.order_handling_leases
      where org_id=p_org and resource_key=any(keys) and busy_until>stamp order by resource_key limit 1;
  else
    result_status:='available'; holder_user:=null; expiry:=null;
  end if;
  if holder_user is not null then
    select coalesce(nullif(btrim(display_name),''),'Team member') into owner_name from public.user_roles
      where org_id=p_org and user_id=holder_user and deleted_at is null;
  end if;
  result:=jsonb_build_object('status',result_status,'holder',case when holder_user is null then null else jsonb_build_object('name',coalesce(owner_name,'Team member')) end,'expires_at',expiry);
  if p_action='begin_write' then
    result:=result || jsonb_build_object('success',true,'operation',operation_id);
  end if;
  return result;
end;
$$;
revoke all on function public.order_handling(uuid,uuid,uuid,jsonb,text,boolean,uuid) from public, anon, authenticated;
grant execute on function public.order_handling(uuid,uuid,uuid,jsonb,text,boolean,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
