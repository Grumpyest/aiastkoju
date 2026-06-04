import { supabase } from '../supabaseClient';

export interface PaymentMethodSummary {
  type?: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  label?: string;
}

export interface PaymentProfileSummary {
  buyerCard?: PaymentMethodSummary | null;
  payoutMethod?: PaymentMethodSummary | null;
  connect?: {
    accountId?: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    disabledReason?: string | null;
  };
}

export interface ConnectAccountSessionSummary {
  clientSecret?: string;
  publishableKey?: string;
  error?: string;
  setupUrl?: string;
}

export const maskLast4 = (last4?: string | null) => {
  if (!last4) {
    return 'Kaarti pole salvestatud';
  }

  return `************${last4}`;
};

const paymentProfileFromRow = (row: any): PaymentProfileSummary => ({
  buyerCard: row?.card_last4
    ? {
        type: 'card',
        brand: row.card_brand || 'kaart',
        last4: row.card_last4,
        expMonth: row.card_exp_month || undefined,
        expYear: row.card_exp_year || undefined,
        label: `${row.card_brand || 'kaart'} **** ${row.card_last4}`,
      }
    : null,
  payoutMethod: row?.payout_method_last4
    ? {
        type: row.payout_method_type || 'konto',
        brand: row.payout_method_brand || 'Konto',
        last4: row.payout_method_last4,
        label: `${row.payout_method_brand || 'Konto'} **** ${row.payout_method_last4}`,
      }
    : null,
  connect: {
    accountId: row?.stripe_connect_account_id || null,
    chargesEnabled: Boolean(row?.stripe_connect_charges_enabled),
    payoutsEnabled: Boolean(row?.stripe_connect_payouts_enabled),
    detailsSubmitted: Boolean(row?.stripe_connect_onboarding_complete),
    disabledReason: null,
  },
});

export const getCachedPaymentProfile = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      card_brand,
      card_last4,
      card_exp_month,
      card_exp_year,
      payout_method_brand,
      payout_method_last4,
      payout_method_type,
      stripe_connect_account_id,
      stripe_connect_charges_enabled,
      stripe_connect_payouts_enabled,
      stripe_connect_onboarding_complete
    `)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return paymentProfileFromRow(data);
};

export const getPaymentProfile = async (options: { refreshStripe?: boolean } = {}) => {
  const { data, error } = await supabase.functions.invoke<PaymentProfileSummary>('payments-get-profile', {
    body: options.refreshStripe ? { refreshStripe: true } : {},
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  return data ?? {};
};

const getFunctionErrorMessage = async (error: any) => {
  const fallback = error?.message || 'Makse tegevus ebaõnnestus.';
  const response = error?.context;

  if (!response) {
    return fallback;
  }

  try {
    const clonedResponse = typeof response.clone === 'function' ? response.clone() : response;
    const payload = await clonedResponse.json();

    if (payload?.error) {
      return String(payload.error);
    }

    if (payload?.message) {
      return String(payload.message);
    }
  } catch {
    return fallback;
  }

  return fallback;
};

export const createConnectAccountSession = async () => {
  const { data, error } = await supabase.functions.invoke<ConnectAccountSessionSummary>(
    'payments-create-account-session'
  );

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data?.clientSecret || !data?.publishableKey) {
    throw new Error('Stripe väljamakse seadistust ei saanud avada.');
  }

  return data;
};

export const disconnectConnectAccount = async () => {
  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    stripeDeleteStatus?: 'none' | 'deleted' | 'skipped' | 'failed';
    stripeDeleteMessage?: string | null;
  }>('payments-disconnect-connect-account');

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.success) {
    throw new Error('Väljamakse konto eemaldamine ebaõnnestus.');
  }

  return data;
};

export const removeBuyerPaymentCard = async () => {
  const { data, error } = await supabase.functions.invoke<{ success?: boolean }>('payments-remove-card');

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.success) {
    throw new Error('Maksekaardi eemaldamine ebaõnnestus.');
  }

  return data;
};

export const activateSellerStatus = async () => {
  const { data, error } = await supabase.functions.invoke<{ success?: boolean }>(
    'payments-create-seller-subscription'
  );

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.success) {
    throw new Error('Aedniku staatust ei saanud aktiveerida.');
  }

  return data;
};

export const deactivateSellerStatus = async () => {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>(
    'payments-cancel-seller-subscription'
  );

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data?.ok) {
    throw new Error('Aedniku staatust ei saanud lõpetada.');
  }

  return data;
};

export const redirectToPaymentFunction = async (
  functionName: string,
  body: Record<string, unknown> = {}
) => {
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(functionName, {
    body,
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data?.url) {
    throw new Error('Makse linki ei saadud luua.');
  }

  window.location.href = data.url;
};
