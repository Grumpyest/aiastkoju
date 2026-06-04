import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  assertPaymentEnv,
  getPrimaryBuyerPaymentMethod,
  stripe,
  supabaseAdmin,
} from '../_shared/stripe.ts';

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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getStripeFeeCents = async (paymentIntentId?: string | null) => {
  if (!paymentIntentId) {
    return 0;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    });
    const latestCharge = paymentIntent.latest_charge;

    if (!latestCharge || typeof latestCharge === 'string') {
      return 0;
    }

    const charge = await stripe.charges.retrieve(latestCharge.id, {
      expand: ['balance_transaction'],
    });
    const balanceTransaction = charge.balance_transaction;

    if (balanceTransaction && typeof balanceTransaction !== 'string') {
      return Math.max(0, Number(balanceTransaction.fee || 0));
    }

    await delay(1000);
  }

  return 0;
};

const getStripeFeeCentsFromCharge = async (chargeId?: string | null) => {
  if (!chargeId) {
    return 0;
  }

  const charge = await stripe.charges.retrieve(chargeId, {
    expand: ['balance_transaction'],
  });
  const balanceTransaction = charge.balance_transaction;

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

const createSellerTransfer = async (options: {
  orderId: string;
  sellerAccountId?: string | null;
  sellerNetCents: number;
  currency: string;
  sourceTransaction?: string;
  checkoutSessionId: string;
}) => {
  if (!options.sellerAccountId || options.sellerNetCents <= 0 || !options.sourceTransaction) {
    return null;
  }

  return await stripe.transfers.create(
    {
      amount: options.sellerNetCents,
      currency: options.currency,
      destination: options.sellerAccountId,
      source_transaction: options.sourceTransaction,
      transfer_group: `aiastkoju_${options.orderId}`,
      metadata: {
        order_id: options.orderId,
        checkout_session_id: options.checkoutSessionId,
      },
    },
    {
      idempotencyKey: `transfer_${options.orderId}`,
    }
  );
};

const updateMarketplaceOrderFees = async (options: {
  paymentIntentId?: string | null;
  sourceTransaction?: string | null;
  stripeFeeCents: number;
  currency?: string | null;
}) => {
  if (!options.paymentIntentId || options.stripeFeeCents <= 0) {
    return;
  }

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('id,seller_id,total,platform_fee_cents,payment_status,seller_net_cents,seller_transfer_id,stripe_checkout_session_id,currency')
    .eq('stripe_payment_intent_id', options.paymentIntentId);

  if (error) {
    throw error;
  }

  const feeAllocations = allocateCents(
    options.stripeFeeCents,
    (orders || []).map((order: any) => ({
      id: String(order.id),
      amountCents: Math.round(Number(order.total || 0) * 100),
    }))
  );
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
    const amountCents = Math.round(Number(order.total || 0) * 100);
    const platformFeeCents = Math.max(0, Number(order.platform_fee_cents || 0));
    const orderStripeFeeCents = Math.max(0, feeAllocations.get(String(order.id)) || 0);
    const sellerNetCents = Math.max(0, amountCents - platformFeeCents - orderStripeFeeCents);
    let sellerTransferId = order.seller_transfer_id || null;
    const isWaitingForFeeTransfer = Number(order.seller_net_cents || 0) === 0;

    if (!sellerTransferId && isWaitingForFeeTransfer) {
      const seller = sellersById.get(String(order.seller_id));
      const transfer = await createSellerTransfer({
        orderId: String(order.id),
        sellerAccountId: seller?.stripe_connect_account_id,
        sellerNetCents,
        currency: String(order.currency || options.currency || 'eur'),
        sourceTransaction: options.sourceTransaction || undefined,
        checkoutSessionId: String(order.stripe_checkout_session_id || ''),
      });

      sellerTransferId = transfer?.id || null;
    }

    await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'paid',
        stripe_fee_cents: orderStripeFeeCents,
        seller_net_cents: sellerNetCents,
        seller_transfer_id: sellerTransferId,
      })
      .eq('id', order.id);
  }
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
    .select('id,seller_id,total,platform_fee_cents,payment_status,stripe_fee_cents,seller_net_cents,seller_transfer_id')
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
    const calculatedSellerNetCents = Math.max(0, amountCents - platformFeeCents - orderStripeFeeCents);
    const sellerNetCents = orderStripeFeeCents > 0 ? calculatedSellerNetCents : 0;

    let sellerTransferId = order.seller_transfer_id || null;

    if (order.payment_status !== 'paid' && orderStripeFeeCents > 0 && !sellerTransferId) {
      const transfer = await createSellerTransfer({
        orderId: String(order.id),
        sellerAccountId: seller?.stripe_connect_account_id,
        sellerNetCents: calculatedSellerNetCents,
        currency: String(session.currency || 'eur'),
        sourceTransaction,
        checkoutSessionId: String(session.id),
      });

      sellerTransferId = transfer?.id || null;
    }

    await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'paid',
        stripe_payment_intent_id: paymentIntentId || null,
        stripe_fee_cents: orderStripeFeeCents,
        seller_net_cents: sellerNetCents,
        seller_transfer_id: sellerTransferId,
      })
      .eq('id', order.id);
  }

  await updateMarketplaceOrderFees({
    paymentIntentId,
    sourceTransaction,
    stripeFeeCents,
    currency: String(session.currency || 'eur'),
  });

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
      case 'charge.succeeded':
      case 'charge.updated': {
        const charge = event.data.object as any;
        const paymentIntentId = typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id;
        const stripeFeeCents = await getStripeFeeCentsFromCharge(charge.id);

        await updateMarketplaceOrderFees({
          paymentIntentId,
          sourceTransaction: charge.id,
          stripeFeeCents,
          currency: charge.currency,
        });
        break;
      }
      default:
        break;
    }

    return jsonResponse({ received: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Webhooki töötlemine ebaõnnestus.', 400);
  }
});
