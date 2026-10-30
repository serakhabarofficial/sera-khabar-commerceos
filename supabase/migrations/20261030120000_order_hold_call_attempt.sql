-- Which unanswered call a held order is on: 1st, 2nd or 3rd (final).
-- Staff move it forward by hand; null reads as the 1st attempt.
alter table public.orders
  add column if not exists hold_call_attempt smallint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_hold_call_attempt_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_hold_call_attempt_check
      check (hold_call_attempt is null or hold_call_attempt between 1 and 3);
  end if;
end;
$$;

notify pgrst, 'reload schema';
