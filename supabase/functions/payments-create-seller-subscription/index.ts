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
import {
  isGardenerSubscriptionActive,
  markSellerSubscription,
} from '../_shared/subscriptions.ts';

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

const getOrCreateGardenerMonthlyPriceId = async () => {
  const configuredPriceId = getConfiguredPriceId();

  if (configuredPriceId) {
    return configuredPriceId;
  }

  const amountCents = getMonthlyAmountCents();
  const lookupKey = `aiastkoju_gardener_monthly_${MARKETPLACE_CURRENCY}_${amountCents}`;
  const existingPrices = await stripe.prices.list({
    active: true,
    lookup_keys: [lookupKey],
    limit: 1,
  });

  if (existingPrices.data[0]?.id) {
    return existingPrices.data[0].id;
  }

  const price = await stripe.prices.create({
    currency: MARKETPLACE_CURRENCY,
    unit_amount: amountCents,
    recurring: {
      interval: 'month',
    },
    lookup_key: lookupKey,
    product_data: {
      name: 'Aiast Koju aedniku kuutasu',
      description: 'Aedniku staatuse kuutasu Aiast Koju platvormil.',
    },
    metadata: {
      purpose: 'gardener_subscription',
    },
  });

  return price.id;
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

    const customerId = await ensureStripeCustomer({
      userId: user.id,
      email: profile.email || user.email || '',
      name: profile.full_name || user.user_metadata?.full_name || null,
    });
    const metadata = {
      purpose: 'gardener_subscription',
      user_id: user.id,
    };

    if (body.useSavedCard === true) {
      const existingSubscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 10,
      });
      const activeSubscription = existingSubscriptions.data.find(subscription =>
        subscription.metadata?.user_id === user.id &&
        subscription.metadata?.purpose === 'gardener_subscription' &&
        isGardenerSubscriptionActive(subscription.status)
      ) || existingSubscriptions.data.find(subscription =>
        subscription.metadata?.user_id === user.id &&
        isGardenerSubscriptionActive(subscription.status)
      );

      if (activeSubscription) {
        const result = await markSellerSubscription(activeSubscription);
        return jsonResponse({
          success: true,
          usedSavedCard: true,
          subscription: {
            id: result?.id || activeSubscription.id,
            status: result?.status || activeSubscription.status,
          },
        });
      }

      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
        limit: 1,
      });
      const paymentMethod = paymentMethods.data[0];

      if (!paymentMethod) {
        return errorResponse('Salvestatud maksekaarti ei leitud. Lisa uus kaart.', 400);
      }

      const priceId = await getOrCreateGardenerMonthlyPriceId();

      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethod.id,
        },
      });

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        default_payment_method: paymentMethod.id,
        payment_behavior: 'default_incomplete',
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
        metadata,
      });
      const result = await markSellerSubscription(subscription);

      if (!result?.isActive) {
        return errorResponse(
          'Olemasolevat kaarti ei saanud automaatselt kinnitada. Vali "Lisa uus kaart", et Stripe saaks makse turvaliselt kinnitada.',
          400
        );
      }

      return jsonResponse({
        success: true,
        usedSavedCard: true,
        subscription: {
          id: result?.id || subscription.id,
          status: result?.status || subscription.status,
        },
      });
    }

    const siteUrl = getSiteUrl(req, typeof body.siteUrl === 'string' ? body.siteUrl : null);
    const publishableKey = Deno.env.get('STRIPE_PUBLISHABLE_KEY');

    if (!publishableKey) {
      return errorResponse('STRIPE_PUBLISHABLE_KEY puudub Supabase Edge Function secrets hulgas.', 500);
    }

    const subscriptionReturnUrl = withStripeCheckoutSessionPlaceholder(
      buildSiteCallbackUrl(siteUrl, {
        gardener_subscription: 'success',
        session_id: '{CHECKOUT_SESSION_ID}',
      })
    );

    const createSession = (
      lineItem: Record<string, unknown>,
      uiMode: 'embedded_page' | 'embedded' = 'embedded_page',
      includeBranding = true
    ) => stripe.checkout.sessions.create({
        mode: 'subscription',
        ui_mode: uiMode,
        customer: customerId,
        payment_method_collection: 'always',
        payment_method_types: ['card'],
        line_items: [lineItem],
        return_url: subscriptionReturnUrl,
        ...(includeBranding
          ? {
              branding_settings: {
                background_color: '#ffffff',
                button_color: '#059669',
                border_style: 'rounded',
                display_name: 'Aiast Koju',
              },
            }
          : {}),
        metadata: {
          ...metadata,
        },
        subscription_data: {
          metadata: {
            ...metadata,
          },
        },
      });

    const configuredPriceId = getConfiguredPriceId();
    let session;

    const createEmbeddedSession = async (lineItem: Record<string, unknown>) => {
      try {
        return await createSession(lineItem, 'embedded_page');
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

        if (message.includes('branding_settings')) {
          return createSession(lineItem, 'embedded_page', false);
        }

        if (!message.includes('ui_mode')) {
          throw error;
        }

        try {
          return await createSession(lineItem, 'embedded');
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error
            ? fallbackError.message.toLowerCase()
            : String(fallbackError).toLowerCase();

          if (fallbackMessage.includes('branding_settings')) {
            return createSession(lineItem, 'embedded', false);
          }

          throw fallbackError;
        }
      }
    };

    try {
      session = await createEmbeddedSession(
        configuredPriceId
          ? { price: configuredPriceId, quantity: 1 }
          : getInlineGardenerSubscriptionLineItem()
      );
    } catch (error) {
      if (!configuredPriceId || !isStripePriceConfigurationError(error)) {
        throw error;
      }

      session = await createEmbeddedSession(getInlineGardenerSubscriptionLineItem());
    }

    if (!session.client_secret) {
      return errorResponse('Stripe ei tagastanud embedded kuutasu client secret väärtust.', 500);
    }

    return jsonResponse({
      clientSecret: session.client_secret,
      publishableKey,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Aedniku kuutasu makselinki ei saanud luua.', 400);
  }
});
