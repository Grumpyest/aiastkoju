import { stripe, supabaseAdmin } from './stripe.ts';

export const isGardenerSubscriptionActive = (status?: string | null) =>
  ['active', 'trialing'].includes(String(status || ''));

export const markSellerSubscription = async (subscription: any) => {
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    return null;
  }

  const isActive = isGardenerSubscriptionActive(subscription.status);

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      stripe_subscription_id: subscription.id,
      gardener_subscription_status: subscription.status,
      is_seller: isActive,
    })
    .eq('id', userId);

  if (error) {
    throw error;
  }

  const { error: productsError } = await supabaseAdmin
    .from('products')
    .update({ is_active: isActive })
    .eq('seller_id', userId);

  if (productsError) {
    throw productsError;
  }

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
  if (!customerId) {
    return null;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
  });

  const matchingSubscription = subscriptions.data.find(subscription =>
    subscription.metadata?.user_id === userId &&
    subscription.metadata?.purpose === 'gardener_subscription' &&
    isGardenerSubscriptionActive(subscription.status)
  ) || subscriptions.data.find(subscription =>
    subscription.metadata?.user_id === userId &&
    isGardenerSubscriptionActive(subscription.status)
  );

  if (!matchingSubscription) {
    return null;
  }

  return markSellerSubscription(matchingSubscription);
};
