import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  assertPaymentEnv,
  getProfile,
  requireRequestUser,
  stripe,
  supabaseAdmin,
} from '../_shared/stripe.ts';

const clearBuyerCardProfile = async (userId: string) => {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      card_brand: null,
      card_last4: null,
      card_exp_month: null,
      card_exp_year: null,
    })
    .eq('id', userId);

  if (error) {
    throw error;
  }
};

const isIgnorableStripeDetachError = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  return (
    message.includes('No such PaymentMethod') ||
    message.includes('resource_missing') ||
    message.includes('does not have access')
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

    const customerId = profile.stripe_customer_id as string | null;

    if (!customerId) {
      await clearBuyerCardProfile(user.id);
      return jsonResponse({ success: true, removedCount: 0 });
    }

    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: null,
      },
    });

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 100,
    });

    let removedCount = 0;

    for (const paymentMethod of paymentMethods.data) {
      try {
        await stripe.paymentMethods.detach(paymentMethod.id);
        removedCount += 1;
      } catch (error) {
        if (!isIgnorableStripeDetachError(error)) {
          throw error;
        }
      }
    }

    await clearBuyerCardProfile(user.id);

    return jsonResponse({ success: true, removedCount });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Maksekaardi eemaldamine ebaÃµnnestus.', 400);
  }
});
