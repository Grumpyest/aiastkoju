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

export const getPaymentProfile = async () => {
  const { data, error } = await supabase.functions.invoke<PaymentProfileSummary>('payments-get-profile');

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
