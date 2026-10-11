import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { serverEnv, supabaseAnonKey, supabaseUrl } from "../env";

/** Client acting as the signed-in user (RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; the middleware refreshes the session instead.
        }
      },
    },
  });
}

/** Privileged client that bypasses RLS. Server-only, used by the reminder cron. */
export function createAdminClient() {
  return createSupabaseClient(supabaseUrl(), serverEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}
