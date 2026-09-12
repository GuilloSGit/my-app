-- Fase 1: schema completo de la automatización de reuniones Zoom.
-- Ver el plan de la sesión 2026-09-12 (ROADMAP.md/PROGRESS.md) para el
-- razonamiento detrás de cada decisión — no es un modelo de datos genérico.

create table meeting_schedules (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('midweek', 'weekend')),
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  local_time time not null,
  timezone text not null default 'America/Argentina/San_Juan',
  duration_minutes int not null,
  active boolean not null default true
);

create table meeting_occurrences (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references meeting_schedules(id),
  starts_at timestamptz not null,
  duration_minutes int not null,
  topic text not null,
  agenda text,
  wol_week text,
  zoom_meeting_id bigint,
  join_url text,
  passcode text,
  status text not null default 'pending'
    check (status in ('pending', 'synced', 'cancelled', 'blocked')),
  blocked_reason text,
  origin text not null default 'schedule'
    check (origin in ('schedule', 'manual')),
  pinned boolean not null default false,
  unique (schedule_id, starts_at)
);

create table schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('assembly', 'special_event', 'no_meeting')),
  label text not null,
  venue text,
  event_days date[] not null,
  suppresses text[] not null,
  creates_zoom boolean not null default false,
  note text,
  created_at timestamptz default now()
);

create table wol_week_cache (
  week text primary key, -- '2026/37'
  midweek_title text,
  midweek_url text,
  weekend_title text,
  weekend_url text,
  fetched_at timestamptz not null default now()
);

create table reconcile_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references meeting_schedules(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  issues jsonb not null default '[]'
);

-- Reemplaza a pg-boss: cola de trabajos a aplicar contra la API de Zoom
-- (Fase 2). `payload` es una foto de los campos deseados al momento de
-- encolar, para que el consumidor no dependa de que la fila de
-- meeting_occurrences no haya cambiado mientras el job esperaba.
create table zoom_outbox (
  id bigint generated always as identity primary key,
  occurrence_id uuid not null references meeting_occurrences(id),
  action text not null check (action in ('create', 'update', 'cancel', 'enrich_agenda')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index zoom_outbox_pending_idx on zoom_outbox (available_at) where status = 'pending';

-- RLS: a diferencia de `meetings` (donde cualquier `authenticated` puede
-- escribir y el gate de admin es solo de UX), acá el blast radius de una
-- escritura mala es mayor — puede quemar el cupo de 100 req/día de Zoom o
-- cancelar un link ya repartido. Ninguna de estas tablas recibe grants de
-- insert/update/delete para `authenticated`: todas las escrituras pasan por
-- Edge Functions admin-gated que usan el service_role (que bypassea RLS).
-- Las lecturas necesarias para la vista de mes sí quedan abiertas.

alter table meeting_schedules enable row level security;
create policy "lectura autenticados" on meeting_schedules for select using (auth.role() = 'authenticated');

alter table meeting_occurrences enable row level security;
create policy "lectura autenticados" on meeting_occurrences for select using (auth.role() = 'authenticated');

alter table schedule_exceptions enable row level security;
create policy "lectura autenticados" on schedule_exceptions for select using (auth.role() = 'authenticated');

alter table reconcile_runs enable row level security;
create policy "lectura autenticados" on reconcile_runs for select using (auth.role() = 'authenticated');

-- wol_week_cache y zoom_outbox son de uso puramente interno (Edge
-- Functions via service_role) — RLS habilitada sin ninguna policy = acceso
-- denegado por completo a anon/authenticated.
alter table wol_week_cache enable row level security;
alter table zoom_outbox enable row level security;
