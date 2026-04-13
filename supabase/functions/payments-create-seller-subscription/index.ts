import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  assertPaymentEnv,
  ensureStripeCustomer,
  getProfile,
  getSiteUrl,
  requireRequestUser,
  stripe,
} from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    assertPaymentEnv();

    const user = await requireRequestUser(req);
    const profile = await getProfile(user.id);
    const priceId = Deno.env.get('STRIPE_GARDENER_MONTHLY_PRICE_ID');

    if (!priceId) {
      return errorResponse('STRIPE_GARDENER_MONTHLY_PRICE_ID puudub Supabase Edge Function env-is.', 500);
    }

    if (!profile?.phone || !profile?.location) {
      return errorResponse('Aedniku kuutasu alustamiseks peavad telefon ja asukoht olema profiilis salvestatud.', 400);
    }

    const siteUrl = getSiteUrl(req);
    const customerId = await ensureStripeCustomer({
      userId: user.id,
      email: profile.email || user.email || '',
      name: profile.full_name || user.user_metadata?.full_name || null,
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/?gardener_subscription=success`,
      cancel_url: `${siteUrl}/?gardener_subscription=cancelled`,
      metadata: {
        purpose: 'gardener_subscription',
        user_id: user.id,
      },
      subscription_data: {
        metadata: {
          purpose: 'gardener_subscription',
          user_id: user.id,
        },
      },
    });

    return jsonResponse({ url: session.url });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Aedniku kuutasu makselinki ei saanud luua.', 400);
  }
});
