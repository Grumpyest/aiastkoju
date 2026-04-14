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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    assertPaymentEnv();

    const user = await requireRequestUser(req);
    const profile = await getProfile(user.id);

    if (!profile) {
      return errorResponse('Profiili ei leitud.', 404);
    }

    let accountId = profile.stripe_connect_account_id as string | null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: Deno.env.get('STRIPE_CONNECT_COUNTRY') || 'EE',
        email: normalizeOptionalEmail(profile.email || user.email),
        business_type: 'individual',
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
    }

    const siteUrl = getSiteUrl(req);
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${siteUrl}/?connect=refresh`,
      return_url: `${siteUrl}/?connect=return`,
      type: 'account_onboarding',
    });

    return jsonResponse({ url: accountLink.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe konto ühendamise linki ei saanud luua.';

    if (message.includes('signed up for Connect')) {
      return jsonResponse({
        error: 'Stripe Connect ei ole platvormi Stripe kontol veel lõpuni aktiveeritud. Ava Stripe Dashboardis Connect seadistus ja proovi siis uuesti.',
        setupUrl: 'https://dashboard.stripe.com/connect',
      });
    }

    return errorResponse(message, 400);
  }
});
