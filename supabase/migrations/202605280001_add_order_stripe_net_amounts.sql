alter table public.orders
  add column if not exists stripe_fee_cents integer not null default 0,
  add column if not exists seller_net_cents integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_stripe_fee_cents_nonnegative'
  ) then
    alter table public.orders
      add constraint orders_stripe_fee_cents_nonnegative
      check (stripe_fee_cents >= 0)
      not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_seller_net_cents_nonnegative'
  ) then
    alter table public.orders
      add constraint orders_seller_net_cents_nonnegative
      check (seller_net_cents >= 0)
      not valid;
  end if;
end $$;
