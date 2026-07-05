import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Los tests E2E (Playwright) inyectan un cliente falso en `window` antes de que
// cargue cualquier script de la app (ver e2e/helpers/mock-supabase.ts), para no
// depender ni pegarle nunca al proyecto Supabase real.
export const supabase: SupabaseClient =
  (typeof window !== "undefined" && (window as any).__E2E_SUPABASE__) ||
  createClient(supabaseUrl, supabaseAnonKey);
