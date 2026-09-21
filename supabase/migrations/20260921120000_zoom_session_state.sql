-- 2026-09-21: la sesión de Zoom guardada en GitHub Secrets venía venciendo
-- en 2-4hs porque cada corrida de CI arrancaba con la MISMA copia de la
-- captura original (Zoom rota/invalida cookies al usarlas). Ahora la
-- sesión vive acá: cada workflow la lee al arrancar y, si sigue activa al
-- terminar, guarda la versión renovada. Ver zoom-automation/lib/session-store.ts.
-- Una sola fila (id = 1). RLS activada SIN policies: contiene cookies
-- reales de la cuenta, solo entra/sale por service_role (nunca por el
-- cliente del navegador, ni siquiera autenticado).
create table zoom_session_state (
  id smallint primary key default 1 check (id = 1),
  state jsonb not null,
  source text not null,
  updated_at timestamptz not null default now()
);

alter table zoom_session_state enable row level security;
