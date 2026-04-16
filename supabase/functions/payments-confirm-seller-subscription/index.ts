import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  assertPaymentEnv,
  requireRequestUser,
  stripe,
} from '../_shared/stripe.ts';
import { markSellerSubscription } from '../_shared/subscriptions.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    assertPaymentEnv();

    const user = await requireRequestUser(req);
    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';

    if (!sessionId || !sessionId.startsWith('cs_')) {
      return errorResponse('Stripe kuutasu sessiooni ID puudub või on vigane.', 400);
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.mode !== 'subscription') {
      return errorResponse('Stripe sessioon ei ole kuutasu makse.', 400);
    }

    if (session.metadata?.purpose !== 'gardener_subscription') {
      return errorResponse('Stripe sessioon ei kuulu aedniku kuutasule.', 400);
    }

    if (session.metadata?.user_id !== user.id) {
      return errorResponse('Stripe sessioon ei kuulu sisselogitud kasutajale.', 403);
    }

    if (session.payment_status !== 'paid') {
      return errorResponse('Aedniku kuutasu makse ei ole veel kinnitatud.', 400);
    }

    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

    if (!subscriptionId) {
      return errorResponse('Stripe kuutasu subscription puudub.', 400);
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const result = await markSellerSubscription(subscription);

    if (!result?.isActive) {
      return errorResponse('Stripe subscription ei ole aktiivne.', 400);
    }

    return jsonResponse({
      success: true,
      subscription: {
        id: result.id,
        status: result.status,
      },
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Aedniku kuutasu kinnitamine ebaõnnestus.', 400);
  }
});
