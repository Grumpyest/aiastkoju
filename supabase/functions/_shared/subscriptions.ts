import { stripe, supabaseAdmin } from './stripe.ts';

export const isGardenerSubscriptionActive = (status?: string | null) =>
  ['active', 'trialing'].includes(String(status || ''));

interface SetSellerAccessInput {
  userId: string;
  isSeller: boolean;
  subscriptionId?: string | null;
  subscriptionStatus?: string | null;
  extraProfileUpdates?: Record<string, unknown>;
}

export const setSellerAccess = async ({
  userId,
  isSeller,
  subscriptionId,
  subscriptionStatus,
  extraProfileUpdates = {},
}: SetSellerAccessInput) => {
  const profileUpdates: Record<string, unknown> = {
    is_seller: isSeller,
    ...extraProfileUpdates,
  };

  if (subscriptionId !== undefined) {
    profileUpdates.stripe_subscription_id = subscriptionId;
  }

  if (subscriptionStatus !== undefined) {
    profileUpdates.gardener_subscription_status = subscriptionStatus;
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(profileUpdates)
    .eq('id', userId);

  if (error) {
    throw error;
  }

  const { error: productsError } = await supabaseAdmin
    .from('products')
    .update({ is_active: isSeller })
    .eq('seller_id', userId);

  if (productsError) {
    throw productsError;
  }

  return {
    userId,
    isSeller,
    subscriptionId: subscriptionId ?? null,
    subscriptionStatus: subscriptionStatus ?? null,
  };
};

export const findActiveGardenerSubscription = async (
  userId: string,
  customerId?: string | null
) => {
  if (!customerId) {
    return null;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
  });

  return subscriptions.data.find(subscription =>
    subscription.metadata?.user_id === userId &&
    subscription.metadata?.purpose === 'gardener_subscription' &&
    isGardenerSubscriptionActive(subscription.status)
  ) || subscriptions.data.find(subscription =>
    subscription.metadata?.user_id === userId &&
    isGardenerSubscriptionActive(subscription.status)
  ) || subscriptions.data.find(subscription =>
    isGardenerSubscriptionActive(subscription.status)
  ) || null;
};

export const cancelActiveGardenerSubscription = async (
  userId: string,
  profile?: {
    stripe_subscription_id?: string | null;
    stripe_customer_id?: string | null;
  } | null
) => {
  let subscriptionId = profile?.stripe_subscription_id
    ? String(profile.stripe_subscription_id)
    : null;

  if (!subscriptionId) {
    const activeSubscription = await findActiveGardenerSubscription(
      userId,
      profile?.stripe_customer_id ? String(profile.stripe_customer_id) : null
    );

    subscriptionId = activeSubscription?.id || null;
  }

  if (!subscriptionId) {
    return null;
  }

  await stripe.subscriptions.cancel(subscriptionId);
  return subscriptionId;
};

export const markSellerSubscription = async (subscription: any) => {
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    return null;
  }

  const isActive = isGardenerSubscriptionActive(subscription.status);
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id || null;

  await setSellerAccess({
    userId,
    isSeller: isActive,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    extraProfileUpdates: customerId ? { stripe_customer_id: customerId } : {},
  });

  return {
    id: subscription.id,
    status: subscription.status,
    isActive,
    userId,
  };
};

export const syncSellerSubscriptionFromStripeCustomer = async (
  userId: string,
  customerId?: string | null
) => {
  const matchingSubscription = await findActiveGardenerSubscription(userId, customerId);

  if (!matchingSubscription) {
    return null;
  }

  return markSellerSubscription(matchingSubscription);
};
