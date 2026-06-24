update public.products
set price_basis = 'per_base_unit'
where lower(unit) = 'g'
  and price_basis = 'per_unit';
