-- The আমসত্ত্ব আচার landing page (/step/am-sotto-achar) captured incomplete
-- checkouts as 'kalojira_mixed' because the source check had no entry for it.
-- Allow its own source, then move the captures whose cart is that product.
alter table public.abandoned_checkouts drop constraint if exists abandoned_checkouts_check;
alter table public.abandoned_checkouts
  add constraint abandoned_checkouts_check
  check (
    (source = 'storefront' and source_path = '/checkout')
    or (source = 'sundarbans_honey' and source_path = '/step/sundarbans-natural-honey')
    or (source = 'kalojira_mixed' and source_path = '/step/kalojira-mixed')
    or (source = 'honey_nut' and source_path = '/step/honey-nut')
    or (source = 'am_sotto_achar' and source_path = '/step/am-sotto-achar')
  );

update public.abandoned_checkouts
set source = 'am_sotto_achar', source_path = '/step/am-sotto-achar'
where source = 'kalojira_mixed'
  and exists (
    select 1 from jsonb_array_elements(cart) as item
    where item->>'productName' like '%আমসত্ত্ব%' or item->>'productName' ilike '%Mango Leather Pickle%'
  );
