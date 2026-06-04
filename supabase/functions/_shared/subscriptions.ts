import { supabaseAdmin } from './stripe.ts';

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
