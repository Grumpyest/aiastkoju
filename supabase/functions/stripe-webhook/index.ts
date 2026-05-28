import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  assertPaymentEnv,
  getPrimaryBuyerPaymentMethod,
  stripe,
  supabaseAdmin,
} from '../_shared/stripe.ts';
import { markSellerSubscription } from '../_shared/subscriptions.ts';

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

const getStripeFeeCents = async (paymentIntentId?: string | null) => {
  if (!paymentIntentId) {
    return 0;
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge.balance_transaction'],
  });
  const latestCharge = paymentIntent.latest_charge;

  if (!latestCharge || typeof latestCharge === 'string') {
    return 0;
  }

  const balanceTransaction = latestCharge.balance_transaction;

  if (!balanceTransaction || typeof balanceTransaction === 'string') {
    return 0;
  }

  return Math.max(0, Number(balanceTransaction.fee || 0));
};

const allocateCents = (totalCents: number, rows: Array<{ id: string; amountCents: number }>) => {
  const allocations = new Map<string, number>();
  const safeTotalCents = Math.max(0, Math.round(totalCents));
  const totalAmountCents = rows.reduce((sum, row) => sum + Math.max(0, row.amountCents), 0);

  if (safeTotalCents === 0 || totalAmountCents === 0 || rows.length === 0) {
    for (const row of rows) {
      allocations.set(row.id, 0);
    }

    return allocations;
  }

  let allocatedCents = 0;
  const remainders = rows.map(row => {
    const rawShare = (safeTotalCents * Math.max(0, row.amountCents)) / totalAmountCents;
    const cents = Math.floor(rawShare);
    allocatedCents += cents;
    allocations.set(row.id, cents);

    return {
      id: row.id,
      remainder: rawShare - cents,
    };
  });

  remainders.sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < safeTotalCents - allocatedCents; i++) {
    const row = remainders[i % remainders.length];
    allocations.set(row.id, (allocations.get(row.id) || 0) + 1);
  }

  return allocations;
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
  let stripeFeeCents = 0;

  if (paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    sourceTransaction = typeof paymentIntent.latest_charge === 'string'
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id;
    stripeFeeCents = await getStripeFeeCents(paymentIntentId);
  }

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('id,seller_id,total,platform_fee_cents,payment_status,stripe_fee_cents,seller_net_cents')
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
  const feeAllocations = allocateCents(
    stripeFeeCents,
    (orders || []).map((order: any) => ({
      id: String(order.id),
      amountCents: Math.round(Number(order.total || 0) * 100),
    }))
  );

  for (const order of orders || []) {
    const seller = sellersById.get(String(order.seller_id));
    const amountCents = Math.round(Number(order.total || 0) * 100);
    const platformFeeCents = Math.max(0, Number(order.platform_fee_cents || 0));
    const orderStripeFeeCents = Math.max(0, feeAllocations.get(String(order.id)) || 0);
    const sellerNetCents = Math.max(0, amountCents - platformFeeCents - orderStripeFeeCents);

    if (order.payment_status !== 'paid' && seller?.stripe_connect_account_id && sellerNetCents > 0) {
      await stripe.transfers.create(
        {
          amount: sellerNetCents,
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
        stripe_fee_cents: orderStripeFeeCents,
        seller_net_cents: sellerNetCents,
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
    assertPaymentEnv();

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
          const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;

          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            await markSellerSubscription(subscription);
          }

          await syncBuyerCard(session.metadata?.user_id || null, customerId || null);
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
