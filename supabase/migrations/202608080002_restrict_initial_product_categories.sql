alter table public.products
  drop constraint if exists products_initial_category_allowed;

alter table public.products
  add constraint products_initial_category_allowed
  check (
    category in (
      'Köögiviljad',
      'Marjad',
      'Puuviljad',
      'Seemned',
      'Istikud',
      'Maitsetaimed',
      'Muu'
    )
  )
  not valid;
