import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  assertPaymentEnv,
  getProfile,
  getSiteUrl,
  normalizeOptionalEmail,
  requireRequestUser,
  stripe,
  supabaseAdmin,
} from '../_shared/stripe.ts';

const connectSetupResponse = () => jsonResponse({
  error: 'Stripe Connect ei ole platvormi Stripe kontol veel lõpuni aktiveeritud. Ava Stripe Dashboardis Connect seadistus ja proovi siis uuesti.',
  setupUrl: 'https://dashboard.stripe.com/connect',
});

const getConnectMcc = () => Deno.env.get('STRIPE_CONNECT_MCC')?.trim() || '5261';

const getBusinessProfile = (siteUrl: string, email?: string | null) => ({
  name: 'Aiast Koju',
  mcc: getConnectMcc(),
  url: siteUrl,
  product_description: 'Aiast Koju on kohalik aiatoodete turg, kus aednik müüb oma kasvatatud tooteid ostjatele platvormi kaudu.',
  support_email: normalizeOptionalEmail(email),
});

const getStripeKeyMode = (key: string, testPrefix: string, livePrefix: string) => {
  if (key.startsWith(testPrefix)) {
    return 'test';
  }

  if (key.startsWith(livePrefix)) {
    return 'live';
  }

  return null;
};

const validatePublishableKey = (publishableKey: string) => {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
  const secretMode = getStripeKeyMode(secretKey, 'sk_test_', 'sk_live_');
  const publishableMode = getStripeKeyMode(publishableKey, 'pk_test_', 'pk_live_');

  if (!publishableMode) {
    return 'STRIPE_PUBLISHABLE_KEY peab algama pk_test_ vÃµi pk_live_.';
  }

  if (secretMode && secretMode !== publishableMode) {
    return 'Stripe vÃµtmed ei klapi: STRIPE_SECRET_KEY ja STRIPE_PUBLISHABLE_KEY peavad olema samast test/live reÅ¾iimist ja samalt Stripe kontolt.';
  }

  return null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    assertPaymentEnv();

    const publishableKey = Deno.env.get('STRIPE_PUBLISHABLE_KEY')?.trim();

    if (!publishableKey) {
      return errorResponse('STRIPE_PUBLISHABLE_KEY puudub Supabase Edge Function secrets hulgas.', 500);
    }

    const publishableKeyError = validatePublishableKey(publishableKey);

    if (publishableKeyError) {
      return errorResponse(publishableKeyError, 500);
    }

    const user = await requireRequestUser(req);
    const profile = await getProfile(user.id);

    if (!profile) {
      return errorResponse('Profiili ei leitud.', 404);
    }

    const siteUrl = getSiteUrl(req);
    let accountId = profile.stripe_connect_account_id as string | null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: Deno.env.get('STRIPE_CONNECT_COUNTRY') || 'EE',
        email: normalizeOptionalEmail(profile.email || user.email),
        business_type: 'individual',
        business_profile: getBusinessProfile(siteUrl, profile.email || user.email),
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          supabase_user_id: user.id,
        },
      });

      accountId = account.id;

      await supabaseAdmin
        .from('profiles')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', user.id);
    } else {
      await stripe.accounts.update(accountId, {
        business_profile: getBusinessProfile(siteUrl, profile.email || user.email),
      });
    }

    const accountSession = await stripe.accountSessions.create({
      account: accountId,
      components: {
        account_onboarding: {
          enabled: true,
          features: {
            external_account_collection: true,
          },
        },
      },
    });

    return jsonResponse({
      clientSecret: accountSession.client_secret,
      publishableKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe konto seadistust ei saanud avada.';

    if (message.includes('signed up for Connect')) {
      return connectSetupResponse();
    }

    return errorResponse(message, 400);
  }
});
