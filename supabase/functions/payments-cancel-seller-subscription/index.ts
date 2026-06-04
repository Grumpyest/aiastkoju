import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { assertSupabaseEnv, getProfile, requireRequestUser } from '../_shared/stripe.ts';
import { setSellerAccess } from '../_shared/subscriptions.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    assertSupabaseEnv();

    const user = await requireRequestUser(req);
    const profile = await getProfile(user.id);

    if (!profile) {
      return errorResponse('Profiili ei leitud.', 404);
    }

    await setSellerAccess({
      userId: user.id,
      isSeller: false,
      subscriptionId: null,
      subscriptionStatus: null,
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Aedniku staatust ei saanud lõpetada.', 400);
  }
});
