import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReconcilePorts } from "./reconcile.ts";
import type { MeetingKind, Schedule, ScheduleException, WolWeekResult } from "./types.ts";
import { fetchWol } from "./wol.ts";
import { buildTopic } from "./topic.ts";

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateOnly(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Mismo cadence que el cron de reconcile ("reconcile-every-2-days", Fase
// 5) — sin TTL, una semana cacheada quedaba congelada para siempre, así
// que una corrección real en wol.jw.org (o, como pasó el 2026-09-14, un
// campo nuevo que el cache viejo nunca llegó a tener) nunca se reflejaba
// sin una intervención manual. Con este TTL, el peor caso es una semana
// desactualizada por hasta un ciclo de cron, nunca "para siempre".
export const WOL_CACHE_TTL_MS = 2 * 24 * 60 * 60 * 1000;

export function isCacheFresh(fetchedAt: string, now: Date, ttlMs: number = WOL_CACHE_TTL_MS): boolean {
  return now.getTime() - new Date(fetchedAt).getTime() < ttlMs;
}

// Adaptador real: implementa ReconcilePorts contra Postgres, usando el
// service_role auto-inyectado en toda Edge Function (nunca un secreto que
// pase por esta sesión). Las tres escrituras van por RPC a funciones
// SECURITY DEFINER (ver migración 20260912165322) que toman
// pg_advisory_xact_lock antes de escribir — cada llamada RPC es, de por sí,
// una transacción PostgREST propia.
export function makeDbPorts(supabase: SupabaseClient, schedule: Schedule): ReconcilePorts {
  return {
    async getSchedule() {
      return schedule;
    },

    async findException(date: Date, kind: MeetingKind): Promise<ScheduleException | null> {
      const dateStr = dateOnly(date);
      const { data, error } = await supabase
        .from("schedule_exceptions")
        .select("*")
        .contains("event_days", [dateStr])
        .contains("suppresses", [kind])
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`findException: ${error.message}`);
      if (!data) return null;

      return {
        id: data.id,
        kind: data.kind,
        label: data.label,
        venue: data.venue,
        eventDays: data.event_days,
        suppresses: data.suppresses,
        createsZoom: data.creates_zoom,
        note: data.note,
      };
    },

    async getWolCached(week: string): Promise<WolWeekResult | null> {
      const { data: cached, error: readError } = await supabase
        .from("wol_week_cache")
        .select("*")
        .eq("week", week)
        .maybeSingle();

      if (readError) throw new Error(`getWolCached (read): ${readError.message}`);

      const cachedResult = (): WolWeekResult => ({
        midweek: cached.midweek_title
          ? {
              title: cached.midweek_title,
              url: cached.midweek_url,
              edition: cached.midweek_edition ?? null,
              bibleReading: cached.midweek_bible_reading ?? null,
            }
          : null,
        weekend: cached.weekend_title
          ? { title: cached.weekend_title, url: cached.weekend_url, edition: cached.weekend_edition ?? null }
          : null,
      });

      if (cached && isCacheFresh(cached.fetched_at, new Date())) {
        return cachedResult();
      }

      // Sin cache, o cache vencido (TTL, ver arriba): refetch real.
      // fetchWol devuelve null tanto para HTTP no-ok como para fallas de
      // red — si había cache vencido, mejor devolver ese contenido viejo
      // que nada: una ventana de TTL que venció en el peor momento (WOL
      // caído justo esa corrida) no debe degradar a `wol_unreachable`
      // cuando en realidad hay contenido (viejo, pero real) disponible.
      const fresh = await fetchWol(week);
      if (fresh === null) return cached ? cachedResult() : null;

      const { error: writeError } = await supabase.from("wol_week_cache").upsert({
        week,
        midweek_title: fresh.midweek?.title ?? null,
        midweek_url: fresh.midweek?.url ?? null,
        midweek_edition: fresh.midweek?.edition ?? null,
        midweek_bible_reading: fresh.midweek?.bibleReading ?? null,
        weekend_title: fresh.weekend?.title ?? null,
        weekend_url: fresh.weekend?.url ?? null,
        weekend_edition: fresh.weekend?.edition ?? null,
        fetched_at: new Date().toISOString(),
      });
      if (writeError) throw new Error(`getWolCached (write): ${writeError.message}`);

      return fresh;
    },

    async cancelOccurrence(scheduleId, date, reason) {
      const { error } = await supabase.rpc("reconciler_cancel_occurrence", {
        p_schedule_id: scheduleId,
        p_starts_at: date.toISOString(),
        p_duration_minutes: schedule.durationMinutes,
        p_topic: buildTopicFor(schedule, date),
        p_reason: reason,
      });
      if (error) throw new Error(`cancelOccurrence: ${error.message}`);
    },

    async markBlocked(scheduleId, date, reason) {
      const { error } = await supabase.rpc("reconciler_mark_blocked", {
        p_schedule_id: scheduleId,
        p_starts_at: date.toISOString(),
        p_duration_minutes: schedule.durationMinutes,
        p_topic: buildTopicFor(schedule, date),
        p_reason: reason,
      });
      if (error) throw new Error(`markBlocked: ${error.message}`);
    },

    async upsertOccurrence(scheduleId, date, fields) {
      const { error } = await supabase.rpc("reconciler_upsert_occurrence", {
        p_schedule_id: scheduleId,
        p_starts_at: date.toISOString(),
        p_duration_minutes: schedule.durationMinutes,
        p_topic: fields.topic,
        p_agenda: fields.agenda,
        p_timezone: schedule.timezone,
      });
      if (error) throw new Error(`upsertOccurrence: ${error.message}`);
    },
  };
}

// cancelOccurrence/markBlocked no reciben el topic ya calculado desde
// reconcile.ts (el spec solo pasa `reason`) — lo recalculamos acá con la
// misma función pura, para no duplicar la fórmula.
function buildTopicFor(schedule: Schedule, date: Date): string {
  return buildTopic(schedule.kind, date, schedule.timezone);
}

export interface RecordedOp {
  action: "cancel" | "block" | "upsert";
  scheduleId: string;
  date: string;
  detail: string | { topic: string; agenda: string | null };
}

// Envuelve cualquier ReconcilePorts real dejando las lecturas intactas
// (para que el preview refleje el estado/WOL real) pero grabando las
// escrituras en vez de aplicarlas — usado por el modo dry-run del editor
// de horario y por las pruebas manuales de esta fase.
export function makeDryRunPorts(real: ReconcilePorts): { ports: ReconcilePorts; recorded: RecordedOp[] } {
  const recorded: RecordedOp[] = [];
  return {
    recorded,
    ports: {
      getSchedule: real.getSchedule,
      findException: real.findException,
      getWolCached: real.getWolCached,
      async cancelOccurrence(scheduleId, date, reason) {
        recorded.push({ action: "cancel", scheduleId, date: date.toISOString(), detail: reason });
      },
      async markBlocked(scheduleId, date, reason) {
        recorded.push({ action: "block", scheduleId, date: date.toISOString(), detail: reason });
      },
      async upsertOccurrence(scheduleId, date, fields) {
        recorded.push({ action: "upsert", scheduleId, date: date.toISOString(), detail: fields });
      },
    },
  };
}
