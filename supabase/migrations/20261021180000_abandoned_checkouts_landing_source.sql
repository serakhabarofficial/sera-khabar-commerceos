-- Storefront landing pages now capture incomplete checkouts as source 'landing'
-- with their own address (/step/<name>), so a new landing page needs no new
-- entry here. The older fixed pairs stay valid for pages still open in a browser.
alter table public.abandoned_checkouts drop constraint if exists abandoned_checkouts_check;
alter table public.abandoned_checkouts
  add constraint abandoned_checkouts_check
  check (
    (source = 'storefront' and source_path = '/checkout')
    or (source = 'sundarbans_honey' and source_path = '/step/sundarbans-natural-honey')
    or (source = 'kalojira_mixed' and source_path = '/step/kalojira-mixed')
    or (source = 'honey_nut' and source_path = '/step/honey-nut')
    or (source = 'am_sotto_achar' and source_path = '/step/am-sotto-achar')
    or (source = 'landing' and source_path ~ '^/step/[a-z0-9]+(-[a-z0-9]+)*$')
  );

update public.abandoned_checkouts
set source = 'landing'
where source = 'am_sotto_achar' and source_path = '/step/am-sotto-achar';
