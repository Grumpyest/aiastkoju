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
    const reviewId = String(body?.reviewId || '').trim();
    const text = cleanText(body?.text);

    if (!reviewId) {
      return errorResponse('Arvustuse ID puudub.', 400);
    }

    if (!text) {
      return errorResponse('Vastus ei saa olla tühi.', 400);
    }

    const { data: review, error: reviewError } = await supabaseAdmin
      .from('reviews')
      .select('id,user_id,product_id,products!inner(seller_id)')
      .eq('id', reviewId)
      .maybeSingle();

    if (reviewError) {
      throw reviewError;
    }

    if (!review) {
      return errorResponse('Arvustust ei leitud.', 404);
    }

    const product = Array.isArray(review.products) ? review.products[0] : review.products;
    const isSeller = String(product?.seller_id || '') === user.id;
    const isAuthor = String(review.user_id || '') === user.id;

    if (!isSeller && !isAuthor) {
      return errorResponse('Sellele arvustusele saab vastata ainult ostja või toote aednik.', 403);
    }

    const role = isSeller ? 'GARDENER' : 'BUYER';
    const profile = await getProfile(user.id);
    const userName = cleanText(profile?.full_name || user.email || 'Kasutaja', 120);

    const { data: reply, error: insertError } = await supabaseAdmin
      .from('review_replies')
      .insert({
        review_id: reviewId,
        user_id: user.id,
        user_name: userName,
        text,
        role,
      })
      .select('id,user_id,user_name,text,role,created_at')
      .single();

    if (insertError) {
      throw insertError;
    }

    return jsonResponse({
      id: String(reply.id),
      userId: String(reply.user_id),
      userName: String(reply.user_name),
      text: String(reply.text),
      role: reply.role,
      createdAt: String(reply.created_at || ''),
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Vastust ei saanud salvestada.', 400);
  }
});
