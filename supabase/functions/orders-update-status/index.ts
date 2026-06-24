import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { assertSupabaseEnv, requireRequestUser, supabaseAdmin } from '../_shared/stripe.ts';

const ALLOWED_STATUSES = new Set(['NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED']);

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
    const status = String(body?.status || '').trim().toUpperCase();

    if (!orderId) {
      return errorResponse('Tellimuse ID puudub.', 400);
    }

    if (!ALLOWED_STATUSES.has(status)) {
      return errorResponse('Tellimuse staatus ei ole lubatud.', 400);
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id,seller_id,status')
      .eq('id', orderId)
      .eq('seller_id', user.id)
      .maybeSingle();

    if (orderError) {
      throw orderError;
    }

    if (!order) {
      return errorResponse('Tellimust ei leitud.', 404);
    }

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ status })
      .eq('id', order.id);

    if (updateError) {
      throw updateError;
    }

    return jsonResponse({ success: true, id: order.id, status });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Tellimuse staatust ei saanud uuendada.', 400);
  }
});
