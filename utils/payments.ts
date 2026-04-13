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
  subscription?: {
    id?: string | null;
    status?: string | null;
  };
}

export const maskLast4 = (last4?: string | null) => {
  if (!last4) {
    return 'Kaarti pole salvestatud';
  }

  return `************${last4}`;
};

export const getPaymentProfile = async () => {
  const { data, error } = await supabase.functions.invoke<PaymentProfileSummary>('payments-get-profile');

  if (error) {
    throw new Error(error.message);
  }

  return data ?? {};
};

export const redirectToPaymentFunction = async (
  functionName: string,
  body: Record<string, unknown> = {}
) => {
  const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string }>(functionName, {
    body,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  if (!data?.url) {
    throw new Error('Makse linki ei saadud luua.');
  }

  window.location.href = data.url;
};
