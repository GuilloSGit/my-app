import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Schedule, Occurrence, ReconcileRunSummary } from "@/lib/automation";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/dashboard/automatizacion",
}));

const { mockGetActiveSchedules, mockGetUpcomingOccurrences, mockGetLatestReconcileRuns } = vi.hoisted(() => ({
  mockGetActiveSchedules: vi.fn(),
  mockGetUpcomingOccurrences: vi.fn(),
  mockGetLatestReconcileRuns: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

vi.mock("@/lib/automation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/automation")>();
  return {
    ...actual,
    getActiveSchedules: mockGetActiveSchedules,
    getUpcomingOccurrences: mockGetUpcomingOccurrences,
    getLatestReconcileRuns: mockGetLatestReconcileRuns,
  };
});

function mockUser(email: string) {
  vi.doMock("@/lib/auth", () => ({
    useAuth: () => ({ user: { email }, loading: false, logout: vi.fn() }),
  }));
}

const schedule: Schedule = {
  id: "s1",
  kind: "midweek",
  weekday: 4,
  localTime: "19:00:00",
  timezone: "America/Argentina/San_Juan",
  durationMinutes: 90,
  active: true,
};

const occurrence: Occurrence = {
  id: "o1",
  scheduleId: "s1",
  scheduleKind: "midweek",
  startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  durationMinutes: 90,
  topic: "Reunión de entresemana - Jueves 17/09",
  agenda: null,
  joinUrl: "https://jworg.zoom.us/j/111",
  passcode: "123456",
  status: "synced",
  blockedReason: null,
  origin: "schedule",
  pinned: false,
};

const run: ReconcileRunSummary = {
  scheduleId: "s1",
  startedAt: "2026-09-12T10:00:00Z",
  finishedAt: "2026-09-12T10:01:00Z",
  issuesCount: 0,
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAIL", "admin@test.com");
  mockPush.mockClear();
  mockGetActiveSchedules.mockReset().mockResolvedValue([schedule]);
  mockGetUpcomingOccurrences.mockReset().mockResolvedValue([occurrence]);
  mockGetLatestReconcileRuns.mockReset().mockResolvedValue([run]);
});

async function renderPage(email: string) {
  mockUser(email);
  const { default: FreshPage } = await import("@/app/dashboard/automatizacion/page");
  return render(<FreshPage />);
}

describe("Vista de mes — control de acceso", () => {
  it("un no-admin es redirigido a /dashboard y no llama a las funciones de datos", async () => {
    await renderPage("miembro@test.com");

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));
    expect(mockGetActiveSchedules).not.toHaveBeenCalled();
  });
});

describe("Vista de mes — admin", () => {
  it("muestra el schedule, la ocurrencia y la última corrida", async () => {
    await renderPage("admin@test.com");

    expect(await screen.findByText("Entresemana")).toBeInTheDocument();
    expect(screen.getByText("Reunión de entresemana - Jueves 17/09")).toBeInTheDocument();
    expect(screen.getByText("Sincronizada")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("borde: sin schedules activos, muestra el estado vacío", async () => {
    mockGetActiveSchedules.mockResolvedValue([]);
    mockGetUpcomingOccurrences.mockResolvedValue([]);
    mockGetLatestReconcileRuns.mockResolvedValue([]);

    await renderPage("admin@test.com");

    expect(await screen.findByText("No hay horarios configurados todavía")).toBeInTheDocument();
  });

  it("borde: ocurrencia bloqueada muestra el motivo", async () => {
    mockGetUpcomingOccurrences.mockResolvedValue([
      { ...occurrence, status: "blocked", blockedReason: "wol_section_missing" },
    ]);

    await renderPage("admin@test.com");

    expect(await screen.findByText("Bloqueada")).toBeInTheDocument();
    expect(screen.getByText(/wol_section_missing/)).toBeInTheDocument();
  });
});
