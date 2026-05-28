alter table public.orders
  add column if not exists seller_transfer_id text;
