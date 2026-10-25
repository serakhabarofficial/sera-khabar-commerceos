-- Same result as before, much faster. The old version matched records with
-- "id matches OR hashed draft key matches", which stopped Postgres using a hash
-- join and recomputed sha256 for every order x checkout pair (~37ms per call,
-- run while holding the workspace order-handling lock). Each link is now its own
-- equi-join, and each checkout's draft-key hash is computed once per call.
-- Both endpoint workspaces are still validated on every edge.
create or replace function public.order_handling_resource_keys(p_org uuid, p_kind text, p_id uuid)
returns text[] language sql volatile security invoker set search_path = ''
as $$
  with recursive draft_hashes as materialized (
    select a.id, encode(sha256(convert_to(a.draft_key::text,'UTF8')),'hex') as h
    from public.abandoned_checkouts a where a.org_id=p_org
  ), edges(a,b) as (
    select 'order:' || o.id, 'abandoned:' || a.id
    from public.orders o join public.abandoned_checkouts a on a.org_id=o.org_id and a.id=o.abandoned_checkout_id
    where o.org_id=p_org
    union
    select 'order:' || o.id, 'abandoned:' || d.id
    from public.orders o join draft_hashes d on d.h=o.abandoned_draft_key_hash
    where o.org_id=p_org
    union
    select 'review:' || r.id, 'abandoned:' || a.id
    from public.order_protection_reviews r join public.abandoned_checkouts a on a.org_id=r.org_id and a.id=r.abandoned_checkout_id
    where r.org_id=p_org
    union
    select 'review:' || r.id, 'abandoned:' || d.id
    from public.order_protection_reviews r join draft_hashes d on d.h=r.abandoned_draft_key_hash
    where r.org_id=p_org
    union
    select 'order:' || o.id, 'attempt:' || t.id
    from public.orders o join public.order_risk_attempts t on t.org_id=o.org_id and t.id=o.risk_attempt_id
    where o.org_id=p_org
    union
    select 'order:' || o.id, 'attempt:' || t.id
    from public.order_risk_attempts t join public.orders o on o.org_id=t.org_id and o.id=t.order_id
    where t.org_id=p_org
    union
    select 'review:' || r.id, 'attempt:' || t.id
    from public.order_protection_reviews r join public.order_risk_attempts t on t.org_id=r.org_id and t.id=r.attempt_id
    where r.org_id=p_org
    union
    select 'review:' || r.id, 'attempt:' || t.id
    from public.order_risk_attempts t join public.order_protection_reviews r on r.org_id=t.org_id and r.id=t.review_id
    where t.org_id=p_org
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
