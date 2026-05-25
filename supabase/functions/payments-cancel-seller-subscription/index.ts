import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { assertPaymentEnv, getProfile, requireRequestUser } from '../_shared/stripe.ts';
import {
  cancelActiveGardenerSubscription,
  setSellerAccess,
} from '../_shared/subscriptions.ts';

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

    const subscriptionId = await cancelActiveGardenerSubscription(user.id, profile);

    await setSellerAccess({
      userId: user.id,
      isSeller: false,
      subscriptionId: subscriptionId ?? (profile.stripe_subscription_id ? String(profile.stripe_subscription_id) : undefined),
      subscriptionStatus: subscriptionId ? 'canceled' : null,
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Aedniku staatust ei saanud lõpetada.', 400);
  }
});
