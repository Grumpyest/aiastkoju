alter table public.products
  add column if not exists price_basis text not null default 'per_unit';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_price_basis_valid'
  ) then
    alter table public.products
      add constraint products_price_basis_valid
      check (price_basis in ('per_unit', 'per_base_unit', 'per_min_order'));
  end if;
end
$$;
