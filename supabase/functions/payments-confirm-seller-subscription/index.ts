import { corsHeaders, errorResponse } from '../_shared/cors.ts';

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return errorResponse('Aedniku subscription-põhine aktiveerimine on eemaldatud.', 410);
});
