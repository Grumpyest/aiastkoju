import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import {
  assertPaymentEnv,
  getRequestUser,
  getSiteUrl,
  MARKETPLACE_CURRENCY,
  PLATFORM_FEE_CENTS,
  stripe,
  supabaseAdmin,
} from '../_shared/stripe.ts';

interface CheckoutItemInput {
  productId: string;
  quantity: number;
}

interface BuyerInput {
  name: string;
  email: string;
  phone: string;
  address?: string;
  notes?: string;
}

const toUuid = () => crypto.randomUUID();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    assertPaymentEnv();

    const user = await getRequestUser(req);
    const siteUrl = getSiteUrl(req);
    const body = await req.json();
    const buyer = body?.buyer as BuyerInput;
    const items = Array.isArray(body?.items) ? body.items as CheckoutItemInput[] : [];

    if (!buyer?.name?.trim() || !buyer?.email?.trim() || !buyer?.phone?.trim()) {
      return errorResponse('Nimi, e-post ja telefon on makse jaoks kohustuslikud.', 400);
    }

    if (items.length === 0) {
      return errorResponse('Ostukorv on tühi.', 400);
    }

    const productIds = [...new Set(items.map(item => String(item.productId)).filter(Boolean))];
    const { data: productRows, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id,seller_id,title,price_cents,unit,stock_qty,min_order_qty,is_active,status')
      .in('id', productIds);

    if (productsError) {
      throw productsError;
    }

    const productsById = new Map((productRows || []).map((product: any) => [String(product.id), product]));
    const sellerIds = [...new Set((productRows || []).map((product: any) => String(product.seller_id)).filter(Boolean))];
    const { data: sellerRows, error: sellersError } = await supabaseAdmin
      .from('profiles')
      .select('id,full_name,email,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled')
      .in('id', sellerIds);

    if (sellersError) {
      throw sellersError;
    }

    const sellersById = new Map((sellerRows || []).map((seller: any) => [String(seller.id), seller]));
    const cartItems = items.map(item => {
      const product = productsById.get(String(item.productId));

      if (!product) {
        throw new Error('Ühte ostukorvi toodet ei leitud.');
      }

      if (product.is_active !== true || String(product.status || 'ACTIVE') !== 'ACTIVE') {
        throw new Error(`Toode "${product.title}" ei ole enam aktiivne.`);
      }

      const quantity = Math.max(1, Number(item.quantity || 1));
      const minQty = Math.max(1, Number(product.min_order_qty || 1));
      const stockQty = Number(product.stock_qty || 0);

      if (quantity < minQty) {
        throw new Error(`Toote "${product.title}" minimaalne tellimus on ${minQty} ${product.unit || 'tk'}.`);
      }

      if (stockQty > 0 && quantity > stockQty) {
        throw new Error(`Toodet "${product.title}" pole piisavas koguses laos.`);
      }

      return {
        product,
        quantity,
        amountCents: Number(product.price_cents || 0) * quantity,
      };
    });

    for (const sellerId of sellerIds) {
      const seller = sellersById.get(sellerId);

      if (!seller?.stripe_connect_account_id) {
        throw new Error('Müüja peab enne maksete vastuvõtmist Stripe väljamakse konto ühendama.');
      }

      const account = await stripe.accounts.retrieve(String(seller.stripe_connect_account_id));

      if (!account.charges_enabled || !account.payouts_enabled) {
        throw new Error('Müüja Stripe konto ei ole veel maksete ja väljamaksete jaoks valmis.');
      }

      await supabaseAdmin
        .from('profiles')
        .update({
          stripe_connect_charges_enabled: Boolean(account.charges_enabled),
          stripe_connect_payouts_enabled: Boolean(account.payouts_enabled),
          stripe_connect_onboarding_complete: Boolean(account.details_submitted),
        })
        .eq('id', sellerId);
    }

    const groupedBySeller = new Map<string, typeof cartItems>();

    for (const item of cartItems) {
      const sellerId = String(item.product.seller_id);
      groupedBySeller.set(sellerId, [...(groupedBySeller.get(sellerId) || []), item]);
    }

    const createdOrderIds: string[] = [];

    for (const [sellerId, sellerItems] of groupedBySeller.entries()) {
      const orderId = toUuid();
      const orderTotalCents = sellerItems.reduce((sum, item) => sum + item.amountCents, 0);

      const { error: orderError } = await supabaseAdmin
        .from('orders')
        .insert({
          id: orderId,
          buyer_id: user?.id ?? null,
          seller_id: sellerId,
          total: orderTotalCents / 100,
          status: 'NEW',
          buyer_name: buyer.name.trim(),
          buyer_email: buyer.email.trim().toLowerCase(),
          buyer_phone: buyer.phone.trim(),
          delivery_address: buyer.address?.trim() || null,
          notes: buyer.notes?.trim() || null,
          payment_status: 'pending',
          platform_fee_cents: PLATFORM_FEE_CENTS,
          currency: MARKETPLACE_CURRENCY,
        });

      if (orderError) {
        throw orderError;
      }

      const orderItems = sellerItems.map(item => ({
        order_id: orderId,
        product_id: item.product.id,
        seller_id: sellerId,
        quantity: item.quantity,
        unit_price: Number(item.product.price_cents || 0) / 100,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        throw itemsError;
      }

      createdOrderIds.push(orderId);
    }

    let customerId: string | undefined;

    if (user) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('stripe_customer_id,full_name,email')
        .eq('id', user.id)
        .maybeSingle();

      customerId = profile?.stripe_customer_id || undefined;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: buyer.email.trim().toLowerCase(),
          name: buyer.name.trim(),
          metadata: {
            supabase_user_id: user.id,
          },
        });

        customerId = customer.id;
        await supabaseAdmin
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id);
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      customer_email: customerId ? undefined : buyer.email.trim().toLowerCase(),
      payment_method_types: ['card'],
      line_items: [
        ...cartItems.map(item => ({
          quantity: item.quantity,
          price_data: {
            currency: MARKETPLACE_CURRENCY,
            unit_amount: Number(item.product.price_cents || 0),
            product_data: {
              name: item.product.title || 'Aiast Koju toode',
              metadata: {
                product_id: String(item.product.id),
              },
            },
          },
        })),
        ...(PLATFORM_FEE_CENTS > 0
          ? [{
            quantity: groupedBySeller.size,
            price_data: {
              currency: MARKETPLACE_CURRENCY,
              unit_amount: PLATFORM_FEE_CENTS,
              product_data: {
                name: 'Aiast Koju teenustasu',
                metadata: {
                  type: 'platform_fee',
                },
              },
            },
          }]
          : []),
      ],
      payment_intent_data: {
        setup_future_usage: user ? 'off_session' : undefined,
        transfer_group: `aiastkoju_${createdOrderIds[0]}`,
        metadata: {
          order_ids: createdOrderIds.join(','),
          buyer_id: user?.id || '',
        },
      },
      metadata: {
        purpose: 'marketplace_order',
        order_ids: createdOrderIds.join(','),
        buyer_id: user?.id || '',
      },
      success_url: `${siteUrl}/?payment=success`,
      cancel_url: `${siteUrl}/?payment=cancelled`,
    });

    await supabaseAdmin
      .from('orders')
      .update({ stripe_checkout_session_id: session.id })
      .in('id', createdOrderIds);

    return jsonResponse({ url: session.url });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Makse alustamine ebaõnnestus.', 400);
  }
});
