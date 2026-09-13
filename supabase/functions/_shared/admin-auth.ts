import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "./cors.ts";

// Duplica a propósito el chequeo de lib/admin.ts (client-side, bundle de
// Next): no hay forma de compartir código entre ese bundle y estas Edge
// Functions de Deno, mismo patrón que ya usan
// RECONCILE_INTERNAL_TOKEN/ZOOM_APPLY_INTERNAL_TOKEN (un chequeo por función).
export function isAdminEmail(
  email: string | null | undefined,
  adminEmailsEnv: string | null | undefined,
): boolean {
  if (!email || !adminEmailsEnv) return false;
  const list = adminEmailsEnv.split(",").map((e) => e.toLowerCase().trim());
  return list.includes(email.toLowerCase().trim());
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function forbidden(): Response {
  return new Response(JSON.stringify({ error: "forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export interface RequireAdminConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  adminEmailsEnv: string | null | undefined;
}

// Gate para Edge Functions de escritura llamadas desde el browser de un
// admin (vía supabase.functions.invoke, que adjunta el JWT de la sesión
// activa solo) — distinto del gate de token interno estático que usan
// reconcile/zoom-apply, pensado para cron/servidor.
//
// Config recibida por parámetro (en vez de leer Deno.env acá) a propósito:
// este módulo lo importa __tests__/shared/admin-auth.test.ts vía Vitest, y
// `Deno` no existe en ese entorno — mismo motivo por el que el resto de
// _shared/ mantiene Deno.env.get(...) solo en el index.ts de cada función.
export async function requireAdmin(
  req: Request,
  config: RequireAdminConfig,
): Promise<{ email: string } | Response> {
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) return unauthorized();

  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user?.email) return unauthorized();

  if (!isAdminEmail(data.user.email, config.adminEmailsEnv)) {
    return forbidden();
  }

  return { email: data.user.email };
}
