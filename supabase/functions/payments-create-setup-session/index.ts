import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { ensureStripeCustomer, getProfile, getSiteUrl, requireRequestUser, stripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await requireRequestUser(req);
    const profile = await getProfile(user.id);
    const siteUrl = getSiteUrl(req);
    const customerId = await ensureStripeCustomer({
      userId: user.id,
      email: profile?.email || user.email || '',
      name: profile?.full_name || user.user_metadata?.full_name || null,
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card'],
      success_url: `${siteUrl}/?payment_method=saved`,
      cancel_url: `${siteUrl}/?payment_method=cancelled`,
      metadata: {
        purpose: 'save_buyer_card',
        user_id: user.id,
      },
    });

    return jsonResponse({ url: session.url });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Kaardi salvestamise linki ei saanud luua.', 400);
  }
});
