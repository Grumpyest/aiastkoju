import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { getProfile, getSiteUrl, requireRequestUser, stripe, supabaseAdmin } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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
        email: profile.email || user.email || undefined,
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
    return errorResponse(error instanceof Error ? error.message : 'Stripe konto ühendamise linki ei saanud luua.', 400);
  }
});
