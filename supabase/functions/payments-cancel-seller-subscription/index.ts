import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { assertPaymentEnv, getProfile, requireRequestUser, stripe, supabaseAdmin } from '../_shared/stripe.ts';
import { isGardenerSubscriptionActive } from '../_shared/subscriptions.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    assertPaymentEnv();

    const user = await requireRequestUser(req);
    const profile = await getProfile(user.id);
    let subscriptionId = profile?.stripe_subscription_id ? String(profile.stripe_subscription_id) : null;

    if (!subscriptionId && profile?.stripe_customer_id) {
      const subscriptions = await stripe.subscriptions.list({
        customer: String(profile.stripe_customer_id),
        status: 'all',
        limit: 10,
      });

      const activeSubscription = subscriptions.data.find(subscription =>
        subscription.metadata?.user_id === user.id &&
        subscription.metadata?.purpose === 'gardener_subscription' &&
        isGardenerSubscriptionActive(subscription.status)
      ) || subscriptions.data.find(subscription =>
        subscription.metadata?.user_id === user.id &&
        isGardenerSubscriptionActive(subscription.status)
      ) || subscriptions.data.find(subscription =>
        isGardenerSubscriptionActive(subscription.status)
      );

      subscriptionId = activeSubscription?.id || null;
    }

    if (subscriptionId) {
      await stripe.subscriptions.cancel(subscriptionId);
    }

    await supabaseAdmin
      .from('profiles')
      .update({
        is_seller: false,
        gardener_subscription_status: 'canceled',
        stripe_subscription_id: subscriptionId,
      })
      .eq('id', user.id);

    await supabaseAdmin
      .from('products')
      .update({ is_active: false })
      .eq('seller_id', user.id);

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Aedniku kuutasu ei saanud lõpetada.', 400);
  }
});
