# ROADMAP — Automatización de reuniones Zoom

> El spec completo (contexto, razonamiento, schema, arquitectura) vive en
> `ZOOM_AUTOMATION.md` — leerlo primero si es la primera vez que se toca esta
> feature. Este archivo es solo el checklist de fases; el detalle
> cronológico de qué se hizo y qué se encontró en cada una vive en
> `PROGRESS.md`.

Arquitectura: todo el backend nuevo vive dentro del mismo proyecto Supabase
que ya usa `meetings` — Edge Functions (Deno) en vez de Fastify, pg_cron +
pg_net en vez de un cron de sistema, una tabla `zoom_outbox` en vez de
pg-boss. Cero hosting nuevo, cero costo nuevo.

## Fase 0 — Spikes y scaffolding

- [x] Verificar selector `.cardLine1` de wol.jw.org contra el DOM real
- [x] Confirmar que el número de semana en la URL de WOL es la semana ISO
- [x] Instalar Supabase CLI, `supabase init` (scaffold local)
- [x] Linkear el proyecto Supabase real (`Reuniones-Media-Agua`, ref `lwucctdliysrsscmjxsh`)
- [x] Habilitar pg_cron + pg_net en el proyecto real (migración aplicada)
- [x] Verificar pg_cron + pg_net disparando una Edge Function trivial end-to-end (confirmado, ver PROGRESS.md)
- [x] Encontrado y arreglado: `.env` con secretos `NEXT_PUBLIC_*` sin gitignorear
- [ ] Verificar cómo se pasa el service-role key a `net.http_post` sin texto plano en `cron.job` (Vault) — se resuelve en Fase 5 cuando haya jobs reales que necesiten auth
- [ ] Verificar si el caché en memoria del token Zoom sobrevive entre invocaciones de una Edge Function (Fase 2, necesita credenciales Zoom)
- [ ] Verificar límite de tiempo de ejecución free-tier vs. el loop de `reconcileMonth` (Fase 2)
- [ ] Verificar si `supabase start` local trae pg_cron/pg_net para paridad de CI — bloqueado hoy por un problema de Docker en esta red (capas grandes se traban), no crítico para seguir
- [x] Crear `ROADMAP.md` y `PROGRESS.md` (este archivo)

## Fase 1 — Schema + reconciliador (dry-run, sin Zoom real)

- [x] Migraciones: `meeting_schedules`, `meeting_occurrences`, `schedule_exceptions`, `wol_week_cache`, `reconcile_runs`, `zoom_outbox` + RLS (aplicadas al proyecto real)
- [x] Módulos puros compartidos: `buildTopic`, `expand()`, diff posicional, parser WOL, `occurrenceDateForWeek`, `isoWeeksBetween` (`supabase/functions/_shared/reconciler/`)
- [x] `reconcileWeek`/`reconcileMonth` — lógica pura con puertos inyectados, apply-a-Zoom todavía no existe (Fase 2)
- [x] Adaptador de puertos contra Postgres real (`db-ports.ts`) + funciones SQL `SECURITY DEFINER` con `pg_advisory_xact_lock` + dirty-check + Edge Function `reconcile` deployada, probada en dry-run y en modo real contra el proyecto (dos corridas seguidas, idempotente, sin errores)
- [x] Suite Vitest completa (topic, expand, diff con pinned, reconcileWeek ok/null/sección-faltante, idempotencia, parser WOL contra fixture real, wrapper de dry-run) — 39 tests del reconciliador, 108 en total, todos verdes
- [x] Flujo manual (`zoom-parser`) sigue intacto, sin tocar

**Fase 1 cerrada — 2026-09-12.**

## Fase 2 — Cliente Zoom real + outbox

- [ ] Cliente Zoom en Deno (S2S OAuth, type:2/use_pmi:false, PATCH preserva join_url, diff campo-por-campo, GET on-demand de start_url)
- [ ] `dequeue_zoom_jobs`/`complete_zoom_job` + función `zoom-apply` con retry/backoff
- [ ] `reconcileWeek` encola jobs reales (invocación manual, sin cron todavía)
- [ ] Tests con `fetch` stubbeado en Deno, nunca contra la API real en CI
- [ ] Verificación manual contra una cuenta de Zoom real

## Fase 3 — Enriquecimiento WOL

- [ ] `wol-enrich`: caché por semana ISO, PATCH de agenda desacoplado de la creación
- [ ] `wol_unreachable` (warning, no toca nada) y `wol_section_missing` (blocked) como paths separados

## Fase 4 — UI

- [ ] Vista de mes (admin-only): fila por semana, chip de estado, join_url
- [ ] Acciones de un clic sobre filas bloqueadas: Marcar Asamblea, Marcar Conmemoración, Crear igual sin contenido, Cancelar esta reunión, Mover a otro día
- [ ] Form de excepción con los defaults acordados (asamblea suprime ambas siempre; evento especial pre-marca por event_days, editable)
- [ ] Editor de horario con preview en texto plano antes de guardar (no opcional)
- [ ] `reconcile_runs.finished_at` siempre visible

## Fase 5 — Cron real + drift-check + retiro del flujo manual

- [ ] Activar cron para las 4 funciones (reconcile diario, zoom-apply cada 2min, wol-enrich diario, drift-check semanal)
- [ ] `drift-check` reporta divergencias, nunca corrige solo
- [ ] Retirar `zoom-import-dialog.tsx`/`lib/zoom-parser.ts` del flujo principal (fallback documentado un ciclo más antes de borrar)
- [ ] Actualizar README/ARCHITECTURE/AGENTS como sistema autoritativo

---

## Preguntas ya resueltas (no volver a preguntar)

- **Suppresses por defecto**: Asamblea (cualquier tipo) suprime siempre ambas
  reuniones, sin Zoom, solo info de lugar/día(s). Acontecimiento especial
  pre-marca la reunión cuyo día caiga en `event_days`, editable. Caso
  "Visita del Superintendente de Circuito" (jueves→martes) se resuelve con
  excepción `suppresses=['midweek']` + ocurrencia `origin='manual'` en la
  fecha nueva, expuesto en la UI como acción "Mover a otro día".
- **Backend/hosting**: 100% dentro del Supabase existente (Edge Functions +
  pg_cron/pg_net + tabla-cola), cero servicio ni hosting nuevo, por costo.
