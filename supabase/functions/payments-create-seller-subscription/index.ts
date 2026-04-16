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

const getConfiguredPriceId = () => {
  const priceId = Deno.env.get('STRIPE_GARDENER_MONTHLY_PRICE_ID')?.trim();

  if (priceId && /^price_[A-Za-z0-9]+$/.test(priceId)) {
    return priceId;
  }

  return null;
};

const getInlineGardenerSubscriptionLineItem = () => {
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

const isStripePriceConfigurationError = (error: unknown) => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('no such price') || message.includes('price') && message.includes('does not exist');
};

const withStripeCheckoutSessionPlaceholder = (url: string) =>
  url.replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}');

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
    const uiMode = body.uiMode === 'embedded' ? 'embedded' : 'hosted';
    const publishableKey = Deno.env.get('STRIPE_PUBLISHABLE_KEY');

    if (uiMode === 'embedded' && !publishableKey) {
      return errorResponse('STRIPE_PUBLISHABLE_KEY puudub Supabase Edge Function secrets hulgas.', 500);
    }

    const subscriptionReturnUrl = withStripeCheckoutSessionPlaceholder(
      buildSiteCallbackUrl(siteUrl, {
        gardener_subscription: 'success',
        session_id: '{CHECKOUT_SESSION_ID}',
      })
    );
    const customerId = await ensureStripeCustomer({
      userId: user.id,
      email: profile.email || user.email || '',
      name: profile.full_name || user.user_metadata?.full_name || null,
    });

    const createSession = (lineItem: Record<string, unknown>) => stripe.checkout.sessions.create({
        mode: 'subscription',
        ui_mode: uiMode,
        customer: customerId,
        line_items: [lineItem],
        ...(uiMode === 'embedded'
          ? {
              return_url: subscriptionReturnUrl,
            }
          : {
              success_url: subscriptionReturnUrl,
              cancel_url: buildSiteCallbackUrl(siteUrl, { gardener_subscription: 'cancelled' }),
            }),
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

    const configuredPriceId = getConfiguredPriceId();
    let session;

    try {
      session = await createSession(
        configuredPriceId
          ? { price: configuredPriceId, quantity: 1 }
          : getInlineGardenerSubscriptionLineItem()
      );
    } catch (error) {
      if (!configuredPriceId || !isStripePriceConfigurationError(error)) {
        throw error;
      }

      session = await createSession(getInlineGardenerSubscriptionLineItem());
    }

    if (uiMode === 'embedded') {
      if (!session.client_secret) {
        return errorResponse('Stripe ei tagastanud embedded kuutasu client secret väärtust.', 500);
      }

      return jsonResponse({
        clientSecret: session.client_secret,
        publishableKey,
      });
    }

    if (!session.url) {
      return errorResponse('Stripe ei tagastanud kuutasu makselinki.', 500);
    }

    return jsonResponse({ url: session.url });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Aedniku kuutasu makselinki ei saanud luua.', 400);
  }
});
