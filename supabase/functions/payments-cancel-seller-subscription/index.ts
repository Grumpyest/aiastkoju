import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { getProfile, requireRequestUser, stripe, supabaseAdmin } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await requireRequestUser(req);
    const profile = await getProfile(user.id);

    if (profile?.stripe_subscription_id) {
      await stripe.subscriptions.cancel(String(profile.stripe_subscription_id));
    }

    await supabaseAdmin
      .from('profiles')
      .update({
        is_seller: false,
        gardener_subscription_status: 'canceled',
      })
      .eq('id', user.id);

    await supabaseAdmin
      .from('products')
      .update({ is_active: false })
      .eq('seller_id', user.id);

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Aedniku kuutasu ei saanud lõpetada.', 400);
  }
});
