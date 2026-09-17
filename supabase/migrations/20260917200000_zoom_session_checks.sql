-- A pedido del usuario 2026-09-17: botón "Verificar sesión de Zoom" en
-- /dashboard/automatizacion, para saber si la sesión guardada de
-- Playwright venció ANTES de que un cancelMeeting/createMeeting falle en
-- silencio (incidente 2026-09-14). Ver zoom-automation/check-session.ts.
-- Mismo criterio de RLS que reconcile_runs: lectura para cualquier
-- autenticado, sin policy de insert (solo entra por service_role, desde
-- el workflow de GitHub Actions).
create table zoom_session_checks (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  ok boolean not null,
  message text
);

alter table zoom_session_checks enable row level security;
create policy "lectura autenticados" on zoom_session_checks
  for select using (auth.role() = 'authenticated');
