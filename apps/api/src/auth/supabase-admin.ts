import { createClient, type User } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | undefined;

export function supabaseAdmin() {
  if (!client) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error('Supabase server credentials are not configured');
    client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return client;
}

export async function verifySupabaseToken(token: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  return error ? null : data.user;
}
