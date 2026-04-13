import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  getPrimaryBuyerPaymentMethod,
  PLATFORM_FEE_CENTS,
  stripe,
  supabaseAdmin,
} from '../_shared/stripe.ts';

const markSellerSubscription = async (subscription: any) => {
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    return;
  }

  const isActive = ['active', 'trialing'].includes(String(subscription.status));

  await supabaseAdmin
    .from('profiles')
    .update({
      stripe_subscription_id: subscription.id,
      gardener_subscription_status: subscription.status,
      is_seller: isActive,
    })
    .eq('id', userId);

  await supabaseAdmin
    .from('products')
    .update({ is_active: isActive })
    .eq('seller_id', userId);
};

const syncBuyerCard = async (userId?: string | null, customerId?: string | null) => {
  if (!userId || !customerId) {
    return;
  }

  const card = await getPrimaryBuyerPaymentMethod(customerId);

  await supabaseAdmin
    .from('profiles')
    .update({
      card_brand: card?.brand || null,
      card_last4: card?.last4 || null,
      card_exp_month: card?.expMonth || null,
      card_exp_year: card?.expYear || null,
    })
    .eq('id', userId);
};

const completeMarketplaceCheckout = async (session: any) => {
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const orderIds = String(session.metadata?.order_ids || '')
    .split(',')
    .map((id: string) => id.trim())
    .filter(Boolean);

  if (orderIds.length === 0) {
    return;
  }

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
  let sourceTransaction: string | undefined;

  if (paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    sourceTransaction = typeof paymentIntent.latest_charge === 'string'
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id;
  }

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('id,seller_id,total,platform_fee_cents,payment_status')
    .in('id', orderIds);

  if (error) {
    throw error;
  }

  const sellerIds = [...new Set((orders || []).map((order: any) => String(order.seller_id)).filter(Boolean))];
  const { data: sellers, error: sellersError } = await supabaseAdmin
    .from('profiles')
    .select('id,stripe_connect_account_id')
    .in('id', sellerIds);

  if (sellersError) {
    throw sellersError;
  }

  const sellersById = new Map((sellers || []).map((seller: any) => [String(seller.id), seller]));

  for (const order of orders || []) {
    if (order.payment_status === 'paid') {
      continue;
    }

    const seller = sellersById.get(String(order.seller_id));
    const amountCents = Math.round(Number(order.total || 0) * 100);
    const platformFeeCents = Math.min(
      amountCents,
      Math.max(0, Number(order.platform_fee_cents ?? PLATFORM_FEE_CENTS))
    );
    const sellerAmountCents = Math.max(0, amountCents - platformFeeCents);

    if (seller?.stripe_connect_account_id && sellerAmountCents > 0) {
      await stripe.transfers.create(
        {
          amount: sellerAmountCents,
          currency: String(session.currency || 'eur'),
          destination: String(seller.stripe_connect_account_id),
          source_transaction: sourceTransaction,
          transfer_group: `aiastkoju_${order.id}`,
          metadata: {
            order_id: String(order.id),
            checkout_session_id: String(session.id),
          },
        },
        {
          idempotencyKey: `transfer_${order.id}`,
        }
      );
    }

    await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'paid',
        stripe_payment_intent_id: paymentIntentId || null,
      })
      .eq('id', order.id);
  }

  await syncBuyerCard(session.metadata?.buyer_id || null, customerId || null);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!webhookSecret) {
    return errorResponse('STRIPE_WEBHOOK_SECRET is missing', 500);
  }

  try {
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return errorResponse('Stripe signature puudub.', 400);
    }

    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;

        if (session.mode === 'payment' && session.metadata?.purpose === 'marketplace_order') {
          await completeMarketplaceCheckout(session);
        }

        if (session.mode === 'setup' && session.metadata?.purpose === 'save_buyer_card') {
          const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
          await syncBuyerCard(session.metadata?.user_id || null, customerId || null);
        }

        if (session.mode === 'subscription' && session.metadata?.purpose === 'gardener_subscription') {
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;

          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            await markSellerSubscription(subscription);
          }
        }

        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object as any;
        const orderIds = String(session.metadata?.order_ids || '')
          .split(',')
          .map((id: string) => id.trim())
          .filter(Boolean);

        if (orderIds.length > 0) {
          await supabaseAdmin
            .from('orders')
            .update({ payment_status: 'cancelled' })
            .in('id', orderIds)
            .eq('payment_status', 'pending');
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await markSellerSubscription(event.data.object);
        break;
      default:
        break;
    }

    return jsonResponse({ received: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Webhooki töötlemine ebaõnnestus.', 400);
  }
});
