import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabasePublicKey = import.meta.env.VITE_SUPABASE_PUBLIC as string;

if (!supabaseUrl?.startsWith('https://') || !supabasePublicKey) {
  throw new Error('Supabase public configuration is missing or invalid.');
}

export const supabase = createClient(supabaseUrl, supabasePublicKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
