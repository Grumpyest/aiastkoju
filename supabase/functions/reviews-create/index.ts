import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { assertSupabaseEnv, getProfile, requireRequestUser, supabaseAdmin } from '../_shared/stripe.ts';

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

const cleanText = (value: unknown, maxLength = 1200) =>
  String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    assertSupabaseEnv();

    const user = await requireRequestUser(req);
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    const productId = String(body?.productId || '').trim();
    const rating = Math.max(1, Math.min(5, Math.round(Number(body?.rating || 0))));
    const comment = cleanText(body?.comment);

    if (!orderId || !productId) {
      return errorResponse('Tellimus või toode puudub.', 400);
    }

    if (!comment) {
      return errorResponse('Palun kirjuta arvustus.', 400);
    }

    const { data: orderItem, error: orderError } = await supabaseAdmin
      .from('order_items')
      .select('order_id,product_id,orders!inner(id,buyer_id,status,payment_status)')
      .eq('order_id', orderId)
      .eq('product_id', productId)
      .eq('orders.buyer_id', user.id)
      .eq('orders.status', 'COMPLETED')
      .eq('orders.payment_status', 'paid')
      .maybeSingle();

    if (orderError) {
      throw orderError;
    }

    if (!orderItem) {
      return errorResponse('Arvustuse saab lisada ainult enda täidetud ja makstud tellimusele.', 403);
    }

    const { data: existingReview, error: existingError } = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('order_id', orderId)
      .eq('product_id', productId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existingReview) {
      return errorResponse('Selle tellimuse tootele on arvustus juba lisatud.', 409);
    }

    const profile = await getProfile(user.id);
    const { data: review, error: insertError } = await supabaseAdmin
      .from('reviews')
      .insert({
        order_id: orderId,
        product_id: productId,
        user_id: user.id,
        rating,
        comment,
      })
      .select('id,order_id,product_id,user_id,rating,comment,created_at')
      .single();

    if (insertError) {
      throw insertError;
    }

    return jsonResponse({
      id: String(review.id),
      orderId: review.order_id ? String(review.order_id) : null,
      productId: String(review.product_id),
      userId: String(review.user_id),
      reviewerName: profile?.full_name || user.email || 'Kasutaja',
      rating: Number(review.rating || 0),
      comment: String(review.comment || ''),
      createdAt: String(review.created_at || ''),
      replies: [],
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Arvustust ei saanud salvestada.', 400);
  }
});
