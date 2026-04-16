import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  assertPaymentEnv,
  buildSiteCallbackUrl,
  ensureStripeCustomer,
  getProfile,
  getSiteUrl,
  MARKETPLACE_CURRENCY,
  requireRequestUser,
  stripe,
} from '../_shared/stripe.ts';

const DEFAULT_GARDENER_MONTHLY_CENTS = 100;

const getMonthlyAmountCents = () => {
  const configuredAmount = Number(Deno.env.get('STRIPE_GARDENER_MONTHLY_CENTS') ?? DEFAULT_GARDENER_MONTHLY_CENTS);

  if (!Number.isFinite(configuredAmount) || configuredAmount < 50) {
    return DEFAULT_GARDENER_MONTHLY_CENTS;
  }

  return Math.round(configuredAmount);
};

const getGardenerSubscriptionLineItem = () => {
  const priceId = Deno.env.get('STRIPE_GARDENER_MONTHLY_PRICE_ID')?.trim();

  if (priceId && /^price_[A-Za-z0-9]+$/.test(priceId)) {
    return { price: priceId, quantity: 1 };
  }

  return {
    quantity: 1,
    price_data: {
      currency: MARKETPLACE_CURRENCY,
      unit_amount: getMonthlyAmountCents(),
      recurring: {
        interval: 'month',
      },
      product_data: {
        name: 'Aiast Koju aedniku kuutasu',
        description: 'Aedniku staatuse kuutasu Aiast Koju platvormil.',
      },
    },
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    assertPaymentEnv();

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const user = await requireRequestUser(req);
    const profile = await getProfile(user.id);

    if (!profile?.phone || !profile?.location) {
      return errorResponse('Aedniku kuutasu alustamiseks peavad telefon ja asukoht olema profiilis salvestatud.', 400);
    }

    const siteUrl = getSiteUrl(req, typeof body.siteUrl === 'string' ? body.siteUrl : null);
    const customerId = await ensureStripeCustomer({
      userId: user.id,
      email: profile.email || user.email || '',
      name: profile.full_name || user.user_metadata?.full_name || null,
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [getGardenerSubscriptionLineItem()],
      success_url: buildSiteCallbackUrl(siteUrl, { gardener_subscription: 'success' }),
      cancel_url: buildSiteCallbackUrl(siteUrl, { gardener_subscription: 'cancelled' }),
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

    if (!session.url) {
      return errorResponse('Stripe ei tagastanud kuutasu makselinki.', 500);
    }

    return jsonResponse({ url: session.url });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Aedniku kuutasu makselinki ei saanud luua.', 400);
  }
});
