-- Fase 0 spike: tabla throwaway para confirmar que pg_cron -> pg_net ->
-- Edge Function corre de punta a punta. Se borra apenas se confirma.
create table public._spike_log (
  id bigserial primary key,
  at timestamptz not null default now()
);
alter table public._spike_log enable row level security;
create policy "spike read" on public._spike_log for select using (true);
