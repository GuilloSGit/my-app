-- drift-check (Fase 5, último ítem pendiente del roadmap): compara la
-- cuenta real de Zoom contra meeting_occurrences y reporta divergencias,
-- nunca corrige solo. Corre en GitHub Actions (Playwright, no puede vivir
-- en una Edge Function de Deno) — ver zoom-automation/drift-check.ts y
-- .github/workflows/zoom-drift-check.yml.
-- Mismo criterio de RLS que reconcile_runs/zoom_session_checks: lectura
-- para cualquier autenticado, sin policy de insert (solo entra por
-- service_role, desde el workflow de GitHub Actions).
create table drift_check_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  issues jsonb not null default '[]'
);

alter table drift_check_runs enable row level security;
create policy "lectura autenticados" on drift_check_runs
  for select using (auth.role() = 'authenticated');
