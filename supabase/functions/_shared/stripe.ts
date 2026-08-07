import Stripe from 'npm:stripe@^17.7.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.96.0';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

export const assertSupabaseEnv = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Teenuse seadistus on puudulik.');
  }
};

export const assertPaymentEnv = () => {
  if (!stripeSecretKey) {
    throw new Error('Maksete seadistus on puudulik.');
  }

  assertSupabaseEnv();
};

export const stripe = new Stripe(stripeSecretKey || 'sk_test_missing', {
  httpClient: Stripe.createFetchHttpClient(),
});

export const supabaseAdmin = createClient(supabaseUrl || 'http://localhost', supabaseServiceRoleKey || 'missing', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const PLATFORM_FEE_CENTS = Math.max(
  0,
  Number(Deno.env.get('STRIPE_PLATFORM_FEE_CENTS') ?? '12')
);

const normalizeCurrency = (value?: string | null) => {
  const normalized = (value || 'eur').trim().toLowerCase();

  if (normalized === '€' || normalized === 'euro') {
    return 'eur';
  }

  return /^[a-z]{3}$/.test(normalized) ? normalized : 'eur';
};

export const MARKETPLACE_CURRENCY = normalizeCurrency(Deno.env.get('STRIPE_CURRENCY'));

export const isValidEmail = (email?: string | null) => {
  if (!email) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

export const normalizeOptionalEmail = (email?: string | null) => {
  if (!isValidEmail(email)) {
    return undefined;
  }

  return email.trim().toLowerCase();
};

const toAbsoluteSiteUrl = (value?: string | null) => {
  const trimmed = value?.trim().replace(/^['"]|['"]$/g, '');

  if (!trimmed) {
    return null;
  }

  const firstUrl = trimmed.split(',')[0]?.trim() || '';

  if (!firstUrl) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(firstUrl) ? firstUrl : `https://${firstUrl}`;

  try {
    const url = new URL(withProtocol);

    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
};

export const getSiteUrl = (_req?: Request, _fallbackUrl?: string | null) => {
  const configuredUrl = toAbsoluteSiteUrl(Deno.env.get('SITE_URL'));
  return configuredUrl || 'https://aiastkoju.vercel.app';
};

export const buildSiteCallbackUrl = (siteUrl: string, params: Record<string, string>) => {
  const url = new URL(siteUrl);
  url.pathname = '/';
  url.search = '';

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
};

export const getRequestUser = async (req: Request) => {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error) {
    return null;
  }

  return data.user ?? null;
};

export const requireRequestUser = async (req: Request) => {
  const user = await getRequestUser(req);

  if (!user) {
    throw new Error('Selle tegevuse jaoks pead sisse logima.');
  }

  return user;
};

const getClientIp = (req: Request) => {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || req.headers.get('cf-connecting-ip') || 'unknown';
};

export const assertRateLimit = async (
  req: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
  userId?: string | null
) => {
  assertSupabaseEnv();

  const identifier = userId || getClientIp(req);
  const key = `${scope}:${identifier}`;
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000).toISOString();

  const { data: current, error: selectError } = await supabaseAdmin
    .from('edge_rate_limits')
    .select('count,reset_at')
    .eq('key', key)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  const currentResetAt = current?.reset_at ? new Date(current.reset_at) : null;

  if (!current || !currentResetAt || currentResetAt <= now) {
    const { error } = await supabaseAdmin
      .from('edge_rate_limits')
      .upsert({
        key,
        count: 1,
        reset_at: resetAt,
        updated_at: now.toISOString(),
      });

    if (error) {
      throw error;
    }

    return;
  }

  if (Number(current.count || 0) >= limit) {
    throw new Error('Liiga palju päringuid. Proovi mõne aja pärast uuesti.');
  }

  const { error: updateError } = await supabaseAdmin
    .from('edge_rate_limits')
    .update({
      count: Number(current.count || 0) + 1,
      updated_at: now.toISOString(),
    })
    .eq('key', key);

  if (updateError) {
    throw updateError;
  }
};

export const getProfile = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
};

export const ensureStripeCustomer = async (options: {
  userId: string;
  email?: string | null;
  name?: string | null;
}) => {
  const profile = await getProfile(options.userId);
  const existingCustomerId = profile?.stripe_customer_id;
  const email = normalizeOptionalEmail(options.email);

  if (existingCustomerId) {
    return String(existingCustomerId);
  }

  const customer = await stripe.customers.create({
    email,
    name: options.name || undefined,
    metadata: {
      supabase_user_id: options.userId,
    },
  });

  await supabaseAdmin
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', options.userId);

  return customer.id;
};

export const paymentMethodSummary = (paymentMethod: Stripe.PaymentMethod | null | undefined) => {
  if (!paymentMethod?.card) {
    return null;
  }

  return {
    type: paymentMethod.type,
    brand: paymentMethod.card.brand,
    last4: paymentMethod.card.last4,
    expMonth: paymentMethod.card.exp_month,
    expYear: paymentMethod.card.exp_year,
    label: `${paymentMethod.card.brand} **** ${paymentMethod.card.last4}`,
  };
};

export const externalAccountSummary = (externalAccount: any) => {
  if (!externalAccount) {
    return null;
  }

  const type = externalAccount.object || externalAccount.type || 'konto';
  const brand = externalAccount.brand || externalAccount.bank_name || type;

  return {
    type,
    brand,
    last4: externalAccount.last4 || null,
    expMonth: externalAccount.exp_month || null,
    expYear: externalAccount.exp_year || null,
    label: externalAccount.last4 ? `${brand} **** ${externalAccount.last4}` : brand,
  };
};

export const getPrimaryBuyerPaymentMethod = async (customerId?: string | null) => {
  if (!customerId) {
    return null;
  }

  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
    limit: 1,
  });

  return paymentMethodSummary(paymentMethods.data[0]);
};
