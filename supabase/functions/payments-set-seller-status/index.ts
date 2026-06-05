import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { assertSupabaseEnv, getProfile, requireRequestUser, supabaseAdmin } from '../_shared/stripe.ts';

const setSellerAccess = async (userId: string, isSeller: boolean) => {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ is_seller: isSeller })
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
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    assertSupabaseEnv();

    const user = await requireRequestUser(req);
    const body = await req.json().catch(() => ({}));
    const isSeller = body?.isSeller === true;
    const profile = await getProfile(user.id);

    if (!profile) {
      return errorResponse('Profiili ei leitud.', 404);
    }

    if (isSeller && (!profile.phone || !profile.location)) {
      return errorResponse('Aedniku staatuse aktiveerimiseks peavad telefon ja asukoht olema profiilis salvestatud.', 400);
    }

    await setSellerAccess(user.id, isSeller);

    return jsonResponse({
      success: true,
      isSeller,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Aedniku staatust ei saanud muuta.', 400);
  }
});
