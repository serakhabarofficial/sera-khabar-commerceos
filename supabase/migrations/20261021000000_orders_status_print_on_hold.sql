-- The fulfilment flow moves orders to 'print' and 'on_hold' (and bulk status
-- accepts 'approved'), but the baseline status check never allowed them.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status = any (array[
    'pending', 'confirmed', 'approved', 'print', 'processing', 'on_hold',
    'cancelled', 'delivered', 'returned', 'partial_delivered', 'rejected', 'fulfilled'
  ]::text[]));
