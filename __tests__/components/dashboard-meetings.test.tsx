import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Occurrence } from "@/lib/automation";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/dashboard",
}));

const { mockGetUpcomingOccurrences } = vi.hoisted(() => ({
  mockGetUpcomingOccurrences: vi.fn(),
}));

// lib/automation.ts importa "@/lib/supabase" a nivel de módulo; se stubea para
// que nunca intente crear un cliente real con env vars ausentes en el entorno
// de test (mismo patrón que ya usaba este archivo con lib/meetings).
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

vi.mock("@/lib/automation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/automation")>();
  return {
    ...actual,
    getUpcomingOccurrences: mockGetUpcomingOccurrences,
  };
});

function mockUser(email: string) {
  vi.doMock("@/lib/auth", () => ({
    useAuth: () => ({
      user: { email },
      loading: false,
      logout: vi.fn(),
    }),
  }));
}

const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const pastDate = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(); // más de 2h atrás

function makeOccurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    id: "occ1",
    scheduleId: "s1",
    scheduleKind: "midweek",
    startsAt: futureDate,
    durationMinutes: 120,
    topic: "Reunión de entresemana - Jueves 17/09",
    agenda: "Lectura de la Biblia: Proverbios 1\nhttps://wol.jw.org/x",
    zoomMeetingId: 1111111111,
    joinUrl: "https://jworg.zoom.us/j/1111111111",
    passcode: "pass123",
    status: "synced",
    blockedReason: null,
    origin: "schedule",
    pinned: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAIL", "admin@test.com");
  mockPush.mockClear();
  mockGetUpcomingOccurrences.mockReset().mockResolvedValue([makeOccurrence()]);
});

async function renderDashboard(email: string) {
  mockUser(email);
  const { default: FreshDashboardPage } = await import("@/app/dashboard/page");
  return render(<FreshDashboardPage />);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Dashboard — lista de reuniones (meeting_occurrences)", () => {
  it("un no-admin ve la reunión sincronizada, sin acciones de administración", async () => {
    await renderDashboard("miembro@test.com");

    await waitFor(() => expect(mockGetUpcomingOccurrences).toHaveBeenCalled());
    expect(await screen.findByText("Reunión de entresemana - Jueves 17/09")).toBeInTheDocument();
    expect(screen.queryByText("Nueva Reunión")).not.toBeInTheDocument();
    expect(screen.queryByText("Panel de Administración:")).not.toBeInTheDocument();
    expect(screen.queryByText("Automatización (vista de mes)")).not.toBeInTheDocument();
  });

  it("un admin ve la misma lista, más el link a Automatización (sin botones de CRUD viejo)", async () => {
    await renderDashboard("admin@test.com");

    await waitFor(() => expect(mockGetUpcomingOccurrences).toHaveBeenCalled());
    expect(await screen.findByText("Reunión de entresemana - Jueves 17/09")).toBeInTheDocument();
    expect(screen.getByText("Automatización (vista de mes)")).toBeInTheDocument();
    expect(screen.queryByText("Nueva Reunión")).not.toBeInTheDocument();
    expect(screen.queryByText("Importar CSV")).not.toBeInTheDocument();
    expect(screen.queryByText("Pegar desde Zoom")).not.toBeInTheDocument();
  });

  it("borde: una ocurrencia 'pending' (sin link todavía) no aparece en la lista", async () => {
    mockGetUpcomingOccurrences.mockResolvedValue([
      makeOccurrence({ id: "occ-pending", status: "pending", joinUrl: null, passcode: null }),
    ]);

    await renderDashboard("miembro@test.com");

    await waitFor(() => expect(mockGetUpcomingOccurrences).toHaveBeenCalled());
    expect(screen.getByText("No hay reuniones programadas")).toBeInTheDocument();
  });

  it("borde: una ocurrencia 'cancelled' no aparece en la lista", async () => {
    mockGetUpcomingOccurrences.mockResolvedValue([
      makeOccurrence({ id: "occ-cancelled", status: "cancelled" }),
    ]);

    await renderDashboard("miembro@test.com");

    await waitFor(() => expect(mockGetUpcomingOccurrences).toHaveBeenCalled());
    expect(screen.getByText("No hay reuniones programadas")).toBeInTheDocument();
  });

  it("borde: una ocurrencia sincronizada que ya empezó hace más de 2h no aparece", async () => {
    mockGetUpcomingOccurrences.mockResolvedValue([
      makeOccurrence({ id: "occ-old", startsAt: pastDate }),
    ]);

    await renderDashboard("miembro@test.com");

    await waitFor(() => expect(mockGetUpcomingOccurrences).toHaveBeenCalled());
    expect(screen.getByText("No hay reuniones programadas")).toBeInTheDocument();
  });
});

describe("Dashboard — compartir por WhatsApp", () => {
  it("arma el mensaje con la agenda cuando la ocurrencia la tiene", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    await renderDashboard("miembro@test.com");
    await waitFor(() => expect(mockGetUpcomingOccurrences).toHaveBeenCalled());

    const shareButtons = await screen.findAllByLabelText("Compartir por WhatsApp");
    await user.click(shareButtons[0]);

    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = openSpy.mock.calls[0][0] as string;
    const message = decodeURIComponent(url.split("text=")[1]);
    expect(message).toContain("Lectura de la Biblia: Proverbios 1");
    expect(message).toContain("Link: https://jworg.zoom.us/j/1111111111");

    openSpy.mockRestore();
  });
});
