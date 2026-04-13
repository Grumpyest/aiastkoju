import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  assertPaymentEnv,
  externalAccountSummary,
  getPrimaryBuyerPaymentMethod,
  getProfile,
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

    const buyerCard = await getPrimaryBuyerPaymentMethod(profile.stripe_customer_id);

    let connect = {
      accountId: profile.stripe_connect_account_id || null,
      chargesEnabled: Boolean(profile.stripe_connect_charges_enabled),
      payoutsEnabled: Boolean(profile.stripe_connect_payouts_enabled),
      detailsSubmitted: false,
      disabledReason: null as string | null,
    };
    let payoutMethod = null;

    if (profile.stripe_connect_account_id) {
      const account = await stripe.accounts.retrieve(String(profile.stripe_connect_account_id), {
        expand: ['external_accounts'],
      });
      const externalAccounts = (account.external_accounts?.data || []) as any[];

      connect = {
        accountId: account.id,
        chargesEnabled: Boolean(account.charges_enabled),
        payoutsEnabled: Boolean(account.payouts_enabled),
        detailsSubmitted: Boolean(account.details_submitted),
        disabledReason: account.requirements?.disabled_reason || null,
      };
      payoutMethod = externalAccountSummary(externalAccounts[0]);

      await supabaseAdmin
        .from('profiles')
        .update({
          stripe_connect_charges_enabled: connect.chargesEnabled,
          stripe_connect_payouts_enabled: connect.payoutsEnabled,
          stripe_connect_onboarding_complete: connect.detailsSubmitted,
          payout_method_brand: payoutMethod?.brand || null,
          payout_method_last4: payoutMethod?.last4 || null,
          payout_method_type: payoutMethod?.type || null,
        })
        .eq('id', user.id);
    }

    return jsonResponse({
      buyerCard,
      payoutMethod,
      connect,
      subscription: {
        id: profile.stripe_subscription_id || null,
        status: profile.gardener_subscription_status || null,
      },
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Makseandmeid ei saanud laadida.', 400);
  }
});
