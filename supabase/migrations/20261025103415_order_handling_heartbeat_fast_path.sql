-- Open order editors heartbeat every 15s and poll status every 10s. Both took the
-- workspace order-handling mutex and rewrote every lease row, so they queued
-- behind each other and caused most of the database's disk writes.
--   * status is read-only, so it no longer takes the mutex.
--   * A heartbeat from the session that already holds every linked record (and
--     with no other operation running) renews without the mutex, and only writes
--     when the last heartbeat is over 30s old or the user was active.
-- Everything else (acquire, release, begin/renew/end_write, contested heartbeats)
-- runs the original locked path unchanged.
CREATE OR REPLACE FUNCTION public.order_handling(p_org uuid, p_user uuid, p_session uuid, p_resources jsonb, p_action text, p_active boolean DEFAULT false, p_operation uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  own_live integer;
  foreign_busy integer;
  fresh boolean;
  renewed integer;
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
  -- Fast path for an open editor's heartbeat: when this session already holds
  -- every linked record and nobody else has an operation running, renew without
  -- the workspace lock. Skip the write entirely while the last heartbeat is under
  -- 30s old (heartbeats come every 15s and the lease lives 60s). Anything else
  -- falls through to the locked path below, unchanged.
  if p_action='heartbeat' then
    stamp := clock_timestamp();
    item := p_resources->0;
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
    select array_agg(distinct k order by k) into keys from unnest(public.order_handling_resource_keys(p_org,resource_kind,resource_id)) k;
    if coalesce(cardinality(keys),0)>0 then
      select count(*) filter (where l.handler_user=p_user and l.handler_session=p_session
               and least(l.activity_at+interval '5 minutes',l.heartbeat_at+interval '60 seconds')>stamp),
             count(*) filter (where l.busy_until>stamp and (l.busy_user<>p_user or l.busy_session<>p_session)),
             coalesce(bool_and(l.heartbeat_at>stamp-interval '30 seconds'),false)
        into own_live, foreign_busy, fresh
        from public.order_handling_leases l where l.org_id=p_org and l.resource_key=any(keys);
      if own_live=cardinality(keys) and foreign_busy=0 then
        renewed := cardinality(keys);
        if p_active or not fresh then
          update public.order_handling_leases set heartbeat_at=stamp,
            activity_at=case when p_active then stamp else activity_at end
          where org_id=p_org and resource_key=any(keys) and handler_user=p_user and handler_session=p_session
            and least(activity_at+interval '5 minutes',heartbeat_at+interval '60 seconds')>stamp;
          get diagnostics renewed = row_count;
        end if;
        if renewed=cardinality(keys) then
          select * into lease from public.order_handling_leases
            where org_id=p_org and resource_key=any(keys) order by resource_key limit 1;
          select coalesce(nullif(btrim(display_name),''),'Team member') into owner_name
            from public.user_roles where org_id=p_org and user_id=p_user and deleted_at is null;
          return jsonb_build_object('status','handling','holder',jsonb_build_object('name',coalesce(owner_name,'Team member')),
            'expires_at',least(lease.activity_at+interval '5 minutes',lease.heartbeat_at+interval '60 seconds'));
        end if;
      end if;
    end if;
    keys := '{}';
  end if;
  -- Short transaction mutex, shared across instances. It also serializes absent
  -- rows, which SELECT FOR UPDATE alone cannot protect. No external work runs
  -- inside this transaction. Sorted alias writes below keep lock order stable.
  -- Status is read-only (no claims or writes below), so it skips the mutex.
  if p_action<>'status' then
    perform pg_advisory_xact_lock(hashtextextended('order-handling:' || p_org,0));
  end if;
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
$function$
;
