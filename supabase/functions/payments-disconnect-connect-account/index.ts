import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  assertPaymentEnv,
  getProfile,
  requireRequestUser,
  stripe,
  supabaseAdmin,
} from '../_shared/stripe.ts';

const clearConnectProfile = async (userId: string) => {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      stripe_connect_account_id: null,
      stripe_connect_charges_enabled: false,
      stripe_connect_payouts_enabled: false,
      stripe_connect_onboarding_complete: false,
      payout_method_brand: null,
      payout_method_last4: null,
      payout_method_type: null,
    })
    .eq('id', userId);

  if (error) {
    throw error;
  }
};

const isIgnorableStripeDeleteError = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  return (
    message.includes('No such account') ||
    message.includes('does not have access') ||
    message.includes('resource_missing')
  );
};

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

    const accountId = profile.stripe_connect_account_id as string | null;
    let stripeDeleteStatus: 'none' | 'deleted' | 'skipped' | 'failed' = accountId ? 'skipped' : 'none';
    let stripeDeleteMessage: string | null = null;

    if (accountId) {
      try {
        await stripe.accounts.del(accountId);
        stripeDeleteStatus = 'deleted';
      } catch (error) {
        if (isIgnorableStripeDeleteError(error)) {
          stripeDeleteStatus = 'skipped';
        } else {
          stripeDeleteStatus = 'failed';
          stripeDeleteMessage = error instanceof Error ? error.message : 'Stripe kontot ei saanud kustutada.';
        }
      }
    }

    await clearConnectProfile(user.id);

    return jsonResponse({
      success: true,
      disconnectedAccountId: accountId,
      stripeDeleteStatus,
      stripeDeleteMessage,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Väljamakse konto eemaldamine ebaõnnestus.', 400);
  }
});
