-- Close public execute on three server-only functions.
--
-- stamp_order_progress() was created without revoking the default PUBLIC grant.
-- next_ml_order_number() and scrub_expired_order_protection_reviews() revoked
-- PUBLIC, but Supabase also grants new public functions directly to anon and
-- authenticated, and those grants stayed. All three were callable through the
-- API by signed-out visitors.
--
-- Only the server calls next_ml_order_number(), with the service role; the
-- scrub runs as service_role; the trigger does not need the caller to hold
-- EXECUTE. Re-running is safe.
begin;

revoke execute on function public.stamp_order_progress() from public, anon, authenticated;
revoke execute on function public.next_ml_order_number() from public, anon, authenticated;
revoke execute on function public.scrub_expired_order_protection_reviews() from public, anon, authenticated;

commit;
