-- Staff notes on incomplete (abandoned) checkouts. Saved from the editor and
-- copied onto orders.notes when the checkout is moved into an order.
alter table public.abandoned_checkouts
  add column if not exists notes text;

alter table public.abandoned_checkouts
  drop constraint if exists abandoned_checkouts_notes_length;
alter table public.abandoned_checkouts
  add constraint abandoned_checkouts_notes_length
  check (notes is null or char_length(notes) <= 2000);
