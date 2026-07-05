import type { Page } from "@playwright/test";

export interface MockMeetingRow {
  id: string;
  title: string;
  date: string;
  zoom_link: string;
  zoom_id: string;
  passcode: string;
}

export interface MockSupabaseOptions {
  /** Sesión activa a simular, o `null` para un visitante sin login. */
  session?: { email: string } | null;
  /** Filas iniciales de la tabla "meetings". */
  meetings?: MockMeetingRow[];
  /** Si se define, `signInWithOtp` resuelve con este mensaje de error. */
  signInWithOtpError?: string | null;
}

/**
 * Instala un Supabase falso en `window.__E2E_SUPABASE__` antes de que cargue
 * cualquier script de la página (ver el seam en lib/supabase.ts). Reproduce
 * en el navegador el mismo store en memoria que ya usan los tests de
 * integración (__tests__/integration/meetings.integration.test.ts), así los
 * tests E2E ejercitan clicks/DOM reales sin tocar el Supabase de verdad.
 */
export async function installMockSupabase(page: Page, options: MockSupabaseOptions = {}) {
  const opts = {
    session: options.session ?? null,
    meetings: options.meetings ?? [],
    signInWithOtpError: options.signInWithOtpError ?? null,
  };

  await page.addInitScript((opts) => {
    let store: any[] = opts.meetings.slice();

    function buildChain() {
      let op = "select";
      let insertData: any = null;
      let updateData: any = null;
      const eqConditions: Array<{ field: string; value: any }> = [];
      let gteField: string | null = null;
      let gteValue: any = null;
      let orderField: string | null = null;
      let orderAsc = true;

      function execute(single: boolean) {
        let result: any[];

        if (op === "insert") {
          const rows = Array.isArray(insertData) ? insertData : [insertData];
          const withIds = rows.map((r: any) => ({
            id: r.id || `mock-${Math.random().toString(36).slice(2)}`,
            ...r,
          }));
          withIds.forEach((r: any) => store.push(r));
          result = withIds;
        } else if (op === "update") {
          const cond = eqConditions.find((c) => c.field === "id");
          store = store.map((r: any) => (cond && r.id === cond.value ? { ...r, ...updateData } : r));
          result = cond ? store.filter((r: any) => r.id === cond.value) : [];
        } else if (op === "delete") {
          const cond = eqConditions.find((c) => c.field === "id");
          result = cond ? store.filter((r: any) => r.id === cond.value) : [];
          if (cond) store = store.filter((r: any) => r.id !== cond.value);
        } else {
          result = [...store];
          if (gteField) result = result.filter((r: any) => r[gteField as string] >= gteValue);
          eqConditions.forEach((c) => {
            result = result.filter((r: any) => r[c.field] === c.value);
          });
          if (orderField) {
            result = [...result].sort((a: any, b: any) => {
              const av = a[orderField as string];
              const bv = b[orderField as string];
              return orderAsc ? (av < bv ? -1 : 1) : av > bv ? -1 : 1;
            });
          }
        }

        const data = single ? result[0] ?? null : result;
        const error = single && result.length === 0 ? { message: "Not found" } : null;
        return Promise.resolve({ data, error });
      }

      const chain: any = {
        select: () => chain,
        insert: (data: any) => {
          op = "insert";
          insertData = data;
          return chain;
        },
        update: (data: any) => {
          op = "update";
          updateData = data;
          return chain;
        },
        delete: () => {
          op = "delete";
          return chain;
        },
        eq: (field: string, value: any) => {
          eqConditions.push({ field, value });
          return chain;
        },
        gte: (field: string, value: any) => {
          gteField = field;
          gteValue = value;
          return chain;
        },
        lt: () => chain,
        order: (field: string, o: any) => {
          orderField = field;
          orderAsc = o?.ascending ?? true;
          return chain;
        },
        single: () => execute(true),
        then: (resolve: any) => execute(false).then(resolve),
      };
      return chain;
    }

    (window as any).__E2E_SUPABASE__ = {
      auth: {
        getSession: () =>
          Promise.resolve({
            data: { session: opts.session ? { user: { email: opts.session.email } } : null },
          }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithOtp: () =>
          Promise.resolve({
            error: opts.signInWithOtpError ? { message: opts.signInWithOtpError } : null,
          }),
        signOut: () => Promise.resolve({ error: null }),
      },
      from: () => buildChain(),
    };
  }, opts);
}
