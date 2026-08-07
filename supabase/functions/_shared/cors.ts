const normalizeOrigin = (value?: string | null) => {
  const trimmed = value?.trim().replace(/^['"]|['"]$/g, '');

  if (!trimmed) {
    return null;
  }

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    return null;
  }
};

const allowedOrigin = normalizeOrigin(Deno.env.get('SITE_URL')) || 'https://aiastkoju.vercel.app';

export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Vary': 'Origin',
};

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

export const errorResponse = (message: string, status = 400) =>
  jsonResponse({ error: message }, status);
