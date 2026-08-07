create or replace function public.is_order_participant(order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = order_id
      and ((select auth.uid()) = o.buyer_id or (select auth.uid()) = o.seller_id)
  );
$$;

create or replace view public.public_seller_profiles as
select id, full_name, location, avatar_url
from public.profiles
where is_seller = true;

grant select on public.public_seller_profiles to anon, authenticated;

create table if not exists public.edge_rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamp with time zone not null,
  updated_at timestamp with time zone not null default now()
);

alter table public.edge_rate_limits enable row level security;
revoke all on public.edge_rate_limits from anon, authenticated;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews enable row level security;
alter table public.review_replies enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles',
        'products',
        'product_images',
        'orders',
        'order_items',
        'reviews',
        'review_replies'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

revoke update on public.profiles from authenticated;
grant update (full_name, email, phone, location, avatar_url) on public.profiles to authenticated;

drop policy if exists "products_select_active_or_own" on public.products;
drop policy if exists "products_insert_own" on public.products;
drop policy if exists "products_update_own" on public.products;
create policy "products_select_active_or_own"
on public.products
for select
to anon, authenticated
using (
  (is_active = true and status = 'ACTIVE')
  or (select auth.uid()) = seller_id
);
create policy "products_insert_own"
on public.products
for insert
to authenticated
with check ((select auth.uid()) = seller_id);
create policy "products_update_own"
on public.products
for update
to authenticated
using ((select auth.uid()) = seller_id)
with check ((select auth.uid()) = seller_id);

drop policy if exists "product_images_select_active_or_own" on public.product_images;
drop policy if exists "product_images_insert_own_product" on public.product_images;
drop policy if exists "product_images_update_own_product" on public.product_images;
drop policy if exists "product_images_delete_own_product" on public.product_images;
create policy "product_images_select_active_or_own"
on public.product_images
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_images.product_id
      and (
        (p.is_active = true and p.status = 'ACTIVE')
        or (select auth.uid()) = p.seller_id
      )
  )
);
create policy "product_images_insert_own_product"
on public.product_images
for insert
to authenticated
with check (
  exists (
    select 1
    from public.products p
    where p.id = product_images.product_id
      and (select auth.uid()) = p.seller_id
  )
);
create policy "product_images_update_own_product"
on public.product_images
for update
to authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_images.product_id
      and (select auth.uid()) = p.seller_id
  )
)
with check (
  exists (
    select 1
    from public.products p
    where p.id = product_images.product_id
      and (select auth.uid()) = p.seller_id
  )
);
create policy "product_images_delete_own_product"
on public.product_images
for delete
to authenticated
using (
  exists (
    select 1
    from public.products p
    where p.id = product_images.product_id
      and (select auth.uid()) = p.seller_id
  )
);

drop policy if exists "orders_select_participant" on public.orders;
drop policy if exists "orders_select_seller" on public.orders;
create policy "orders_select_participant"
on public.orders
for select
to authenticated
using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);

drop policy if exists "order_items_select_order_participant" on public.order_items;
create policy "order_items_select_order_participant"
on public.order_items
for select
to authenticated
using ((select public.is_order_participant(order_id)));

drop policy if exists "reviews_select_public" on public.reviews;
create policy "reviews_select_public"
on public.reviews
for select
to anon, authenticated
using (true);

drop policy if exists "review_replies_select_public" on public.review_replies;
create policy "review_replies_select_public"
on public.review_replies
for select
to anon, authenticated
using (true);

create index if not exists profiles_is_seller_idx on public.profiles (is_seller);
create index if not exists products_seller_id_idx on public.products (seller_id);
create index if not exists products_active_status_idx on public.products (is_active, status);
create index if not exists product_images_product_id_idx on public.product_images (product_id);
create index if not exists orders_buyer_id_idx on public.orders (buyer_id);
create index if not exists orders_seller_id_idx on public.orders (seller_id);
create index if not exists order_items_order_id_idx on public.order_items (order_id);

drop policy if exists "product_images_storage_public_select" on storage.objects;
drop policy if exists "product_images_storage_insert_own_prefix" on storage.objects;
drop policy if exists "product_images_storage_update_own_prefix" on storage.objects;
drop policy if exists "product_images_storage_delete_own_prefix" on storage.objects;
create policy "product_images_storage_public_select"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'product-images');
create policy "product_images_storage_insert_own_prefix"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "product_images_storage_update_own_prefix"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "product_images_storage_delete_own_prefix"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
