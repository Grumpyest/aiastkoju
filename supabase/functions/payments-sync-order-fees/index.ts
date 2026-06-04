import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  assertPaymentEnv,
  requireRequestUser,
  stripe,
  supabaseAdmin,
} from '../_shared/stripe.ts';

interface SyncOrderFeesBody {
  orderId?: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getStripeFeeCents = async (paymentIntentId: string) => {
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

const getLatestChargeId = async (paymentIntentId: string) => {
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const latestCharge = paymentIntent.latest_charge;
  return typeof latestCharge === 'string' ? latestCharge : latestCharge?.id || undefined;
};

const getPaidSessionPaymentIntentId = async (checkoutSessionId?: string | null) => {
  if (!checkoutSessionId) {
    return null;
  }

  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);

  if (session.payment_status !== 'paid') {
    return null;
  }

  const paymentIntent = session.payment_intent;
  return typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id || null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    assertPaymentEnv();

    const user = await requireRequestUser(req);
    const body = await req.json() as SyncOrderFeesBody;
    const orderId = String(body?.orderId || '').trim();

    if (!orderId) {
      return errorResponse('Tellimuse ID puudub.', 400);
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id,seller_id,total,platform_fee_cents,payment_status,stripe_payment_intent_id,stripe_checkout_session_id,seller_transfer_id,seller_net_cents,currency')
      .eq('id', orderId)
      .eq('seller_id', user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!order) {
      return errorResponse('Tellimust ei leitud.', 404);
    }

    const paymentIntentId = order.stripe_payment_intent_id ||
      await getPaidSessionPaymentIntentId(order.stripe_checkout_session_id);

    if (!paymentIntentId) {
      return jsonResponse({
        id: order.id,
        stripeFeeCents: 0,
        sellerNetCents: Math.max(
          0,
          Math.round(Number(order.total || 0) * 100) - Math.max(0, Number(order.platform_fee_cents || 0))
        ),
        sellerTransferId: order.seller_transfer_id || null,
      });
    }

    const amountCents = Math.round(Number(order.total || 0) * 100);
    const platformFeeCents = Math.max(0, Number(order.platform_fee_cents || 0));
    const stripeFeeCents = await getStripeFeeCents(String(paymentIntentId));
    const sellerNetCents = Math.max(0, amountCents - platformFeeCents - stripeFeeCents);
    let sellerTransferId = order.seller_transfer_id || null;
    const isWaitingForFeeTransfer = Number(order.seller_net_cents || 0) === 0;

    if (stripeFeeCents > 0 && !sellerTransferId && isWaitingForFeeTransfer) {
      const { data: seller, error: sellerError } = await supabaseAdmin
        .from('profiles')
        .select('stripe_connect_account_id')
        .eq('id', order.seller_id)
        .maybeSingle();

      if (sellerError) {
        throw sellerError;
      }

      const sourceTransaction = await getLatestChargeId(String(paymentIntentId));

      if (seller?.stripe_connect_account_id && sourceTransaction) {
        const transfer = await stripe.transfers.create(
          {
            amount: sellerNetCents,
            currency: String(order.currency || 'eur'),
            destination: String(seller.stripe_connect_account_id),
            source_transaction: sourceTransaction,
            transfer_group: `aiastkoju_${order.id}`,
            metadata: {
              order_id: String(order.id),
              checkout_session_id: String(order.stripe_checkout_session_id || ''),
            },
          },
          {
            idempotencyKey: `transfer_${order.id}`,
          }
        );

        sellerTransferId = transfer.id;
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'paid',
        stripe_payment_intent_id: String(paymentIntentId),
        stripe_fee_cents: stripeFeeCents,
        seller_net_cents: sellerNetCents,
        seller_transfer_id: sellerTransferId,
      })
      .eq('id', order.id);

    if (updateError) {
      throw updateError;
    }

    return jsonResponse({
      id: order.id,
      stripeFeeCents,
      sellerNetCents,
      sellerTransferId,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Stripe tasu uuendamine ebaõnnestus.', 400);
  }
});
