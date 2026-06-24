drop policy if exists "sellers_can_update_their_orders" on public.orders;
drop policy if exists "orders_select_seller" on public.orders;
drop policy if exists "authenticated users can insert reviews" on public.reviews;
drop policy if exists "review_replies_insert_own" on public.review_replies;

create policy "orders_select_seller"
on public.orders
for select
to authenticated
using (seller_id = auth.uid());

create policy "reviews_insert_completed_order"
on public.reviews
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.id = reviews.order_id
      and o.buyer_id = auth.uid()
      and o.status = 'COMPLETED'
      and o.payment_status = 'paid'
      and oi.product_id = reviews.product_id
  )
);

create policy "review_replies_insert_author_or_seller"
on public.review_replies
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    (
      role = 'GARDENER'
      and exists (
        select 1
        from public.reviews r
        join public.products p on p.id = r.product_id
        where r.id = review_replies.review_id
          and p.seller_id = auth.uid()
      )
    )
    or (
      role = 'BUYER'
      and exists (
        select 1
        from public.reviews r
        where r.id = review_replies.review_id
          and r.user_id = auth.uid()
      )
    )
  )
);

update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'product-images';
