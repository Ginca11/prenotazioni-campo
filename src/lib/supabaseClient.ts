import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // fondamentale per recuperare la sessione da URL dopo verify/recovery
    detectSessionInUrl: true,
    // conserva la sessione tra refresh e tab
    persistSession: true,
    // storage standard (browser)
    autoRefreshToken: true,
  },
});
