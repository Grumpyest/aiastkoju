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
      expand: ['latest_charge.balance_transaction'],
    });
    const latestCharge = paymentIntent.latest_charge;

    if (!latestCharge || typeof latestCharge === 'string') {
      return 0;
    }

    const balanceTransaction = latestCharge.balance_transaction;

    if (balanceTransaction && typeof balanceTransaction !== 'string') {
      return Math.max(0, Number(balanceTransaction.fee || 0));
    }

    await delay(1000);
  }

  return 0;
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
      .select('id,seller_id,total,platform_fee_cents,payment_status,stripe_payment_intent_id')
      .eq('id', orderId)
      .eq('seller_id', user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!order) {
      return errorResponse('Tellimust ei leitud.', 404);
    }

    if (order.payment_status !== 'paid' || !order.stripe_payment_intent_id) {
      return jsonResponse({
        id: order.id,
        stripeFeeCents: 0,
        sellerNetCents: Math.max(
          0,
          Math.round(Number(order.total || 0) * 100) - Math.max(0, Number(order.platform_fee_cents || 0))
        ),
      });
    }

    const amountCents = Math.round(Number(order.total || 0) * 100);
    const platformFeeCents = Math.max(0, Number(order.platform_fee_cents || 0));
    const stripeFeeCents = await getStripeFeeCents(String(order.stripe_payment_intent_id));
    const sellerNetCents = Math.max(0, amountCents - platformFeeCents - stripeFeeCents);

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        stripe_fee_cents: stripeFeeCents,
        seller_net_cents: sellerNetCents,
      })
      .eq('id', order.id);

    if (updateError) {
      throw updateError;
    }

    return jsonResponse({
      id: order.id,
      stripeFeeCents,
      sellerNetCents,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Stripe tasu uuendamine ebaõnnestus.', 400);
  }
});
