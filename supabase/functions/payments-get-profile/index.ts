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
import {
  isGardenerSubscriptionActive,
  syncSellerSubscriptionFromStripeCustomer,
} from '../_shared/subscriptions.ts';

const cachedBuyerCardFromProfile = (profile: any) => {
  if (!profile.card_last4) {
    return null;
  }

  return {
    type: 'card',
    brand: profile.card_brand || 'kaart',
    last4: profile.card_last4,
    expMonth: profile.card_exp_month || null,
    expYear: profile.card_exp_year || null,
    label: `${profile.card_brand || 'kaart'} **** ${profile.card_last4}`,
  };
};

const cachedPayoutMethodFromProfile = (profile: any) => {
  if (!profile.payout_method_last4) {
    return null;
  }

  return {
    type: profile.payout_method_type || 'konto',
    brand: profile.payout_method_brand || 'Konto',
    last4: profile.payout_method_last4,
    expMonth: null,
    expYear: null,
    label: `${profile.payout_method_brand || 'Konto'} **** ${profile.payout_method_last4}`,
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    assertPaymentEnv();

    const body = await req.json().catch(() => ({}));
    const refreshStripe = body?.refreshStripe === true;
    const user = await requireRequestUser(req);
    const profile = await getProfile(user.id);

    if (!profile) {
      return errorResponse('Profiili ei leitud.', 404);
    }

    const syncedSubscription = !refreshStripe || isGardenerSubscriptionActive(profile.gardener_subscription_status)
      ? null
      : await syncSellerSubscriptionFromStripeCustomer(user.id, profile.stripe_customer_id);

    let buyerCard = cachedBuyerCardFromProfile(profile);

    if (refreshStripe && profile.stripe_customer_id) {
      buyerCard = await getPrimaryBuyerPaymentMethod(profile.stripe_customer_id);

      await supabaseAdmin
        .from('profiles')
        .update({
          card_brand: buyerCard?.brand || null,
          card_last4: buyerCard?.last4 || null,
          card_exp_month: buyerCard?.expMonth || null,
          card_exp_year: buyerCard?.expYear || null,
        })
        .eq('id', user.id);
    }

    let connect = {
      accountId: profile.stripe_connect_account_id || null,
      chargesEnabled: Boolean(profile.stripe_connect_charges_enabled),
      payoutsEnabled: Boolean(profile.stripe_connect_payouts_enabled),
      detailsSubmitted: Boolean(profile.stripe_connect_onboarding_complete),
      disabledReason: null as string | null,
    };
    let payoutMethod = cachedPayoutMethodFromProfile(profile);

    if (refreshStripe && profile.stripe_connect_account_id) {
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
        id: syncedSubscription?.id || profile.stripe_subscription_id || null,
        status: syncedSubscription?.status || profile.gardener_subscription_status || null,
      },
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Makseandmeid ei saanud laadida.', 400);
  }
});
