import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  assertPaymentEnv,
  requireRequestUser,
  stripe,
} from '../_shared/stripe.ts';
import { setSellerAccess } from '../_shared/subscriptions.ts';

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
      return errorResponse('Stripe legacy sessiooni ID puudub või on vigane.', 400);
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.mode !== 'subscription') {
      return errorResponse('Stripe sessioon ei ole legacy kuutasu makse.', 400);
    }

    if (session.metadata?.purpose !== 'gardener_subscription') {
      return errorResponse('Stripe sessioon ei kuulu aedniku legacy kuutasule.', 400);
    }

    if (session.metadata?.user_id !== user.id) {
      return errorResponse('Stripe sessioon ei kuulu sisselogitud kasutajale.', 403);
    }

    if (session.payment_status !== 'paid') {
      return errorResponse('Legacy makse ei ole veel kinnitatud.', 400);
    }

    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

    if (subscriptionId) {
      await stripe.subscriptions.cancel(subscriptionId);
    }

    await setSellerAccess({
      userId: user.id,
      isSeller: true,
      subscriptionId: subscriptionId || undefined,
      subscriptionStatus: subscriptionId ? 'canceled' : null,
    });

    return jsonResponse({
      success: true,
      subscription: {
        id: subscriptionId || null,
        status: subscriptionId ? 'canceled' : null,
      },
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Aedniku legacy staatust ei saanud kinnitada.', 400);
  }
});
