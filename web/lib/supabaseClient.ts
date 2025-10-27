import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

const url = SUPABASE_URL as string;
const anonKey = SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Allow building even if env is missing; runtime checks can handle it.
  // eslint-disable-next-line no-console
  console.warn('Supabase env vars are not set. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(url ?? '', anonKey ?? ''); 