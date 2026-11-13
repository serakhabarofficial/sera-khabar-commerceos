begin;

-- Lets an admin open the Business Report and the unblurred Staff Performance
-- totals to a chosen team member. Admins always have this access. Only the
-- server (service role) writes user_roles, so a member cannot grant it to themselves.
alter table public.user_roles
  add column if not exists can_view_reports boolean not null default false;

commit;
