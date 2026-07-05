import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Meeting } from "@/lib/meetings";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/dashboard",
}));

const {
  mockGetUpcomingMeetings,
  mockCreateMeeting,
  mockUpdateMeeting,
  mockDeleteMeeting,
} = vi.hoisted(() => ({
  mockGetUpcomingMeetings: vi.fn(),
  mockCreateMeeting: vi.fn(),
  mockUpdateMeeting: vi.fn(),
  mockDeleteMeeting: vi.fn(),
}));

// lib/meetings.ts importa "@/lib/supabase" a nivel de módulo; se stubea para que
// nunca intente crear un cliente real con env vars ausentes en el entorno de test.
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

vi.mock("@/lib/meetings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meetings")>();
  return {
    ...actual,
    getUpcomingMeetings: mockGetUpcomingMeetings,
    createMeeting: mockCreateMeeting,
    updateMeeting: mockUpdateMeeting,
    deleteMeeting: mockDeleteMeeting,
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

const existingMeeting: Meeting = {
  id: "abc123",
  title: "Reunión General",
  date: futureDate,
  zoomLink: "https://zoom.us/j/111",
  zoomId: "111111",
  passcode: "pass123",
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAIL", "admin@test.com");
  mockPush.mockClear();
  mockGetUpcomingMeetings.mockReset().mockResolvedValue([existingMeeting]);
  mockCreateMeeting.mockReset().mockResolvedValue({ ...existingMeeting, id: "new1" });
  mockUpdateMeeting.mockReset().mockResolvedValue({ ...existingMeeting, title: "Actualizada" });
  mockDeleteMeeting.mockReset().mockResolvedValue(true);
});

async function renderDashboard(email: string) {
  mockUser(email);
  const { default: FreshDashboardPage } = await import("@/app/dashboard/page");
  return render(<FreshDashboardPage />);
}

async function fillMeetingForm(user: ReturnType<typeof userEvent.setup>, container: HTMLElement, title: string) {
  const titleInput = screen.getByPlaceholderText("Ej: Reunión General");
  await user.clear(titleInput);
  await user.type(titleInput, title);

  const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
  const localDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 16);
  await user.type(dateInput, localDate);

  await user.type(screen.getByPlaceholderText("https://zoom.us/j/..."), "https://zoom.us/j/999");
  await user.type(screen.getByPlaceholderText("123 456 7890"), "999999");
  await user.type(screen.getByPlaceholderText("mediaagua"), "clave123");
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Dashboard — control de acceso", () => {
  it("un usuario no-admin no ve acciones de administración", async () => {
    await renderDashboard("miembro@test.com");

    await waitFor(() => expect(mockGetUpcomingMeetings).toHaveBeenCalled());
    expect(screen.queryByText("Nueva Reunión")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Editar")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Eliminar")).not.toBeInTheDocument();
  });
});

describe("Dashboard — crear reunión (admin)", () => {
  it("camino feliz: crea la reunión y refresca la lista", async () => {
    const user = userEvent.setup();
    const { container } = await renderDashboard("admin@test.com");

    await waitFor(() => expect(mockGetUpcomingMeetings).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText("Nueva Reunión"));
    await fillMeetingForm(user, container, "Reunión Nueva");
    await user.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(mockCreateMeeting).toHaveBeenCalledTimes(1));
    expect(mockCreateMeeting).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Reunión Nueva",
        zoomLink: "https://zoom.us/j/999",
        zoomId: "999999",
        passcode: "clave123",
      })
    );
    await waitFor(() => expect(mockGetUpcomingMeetings).toHaveBeenCalledTimes(2));
  });

  it("borde: título solo con espacios no llama a createMeeting y muestra el error de validación", async () => {
    const user = userEvent.setup();
    const { container } = await renderDashboard("admin@test.com");

    await waitFor(() => expect(mockGetUpcomingMeetings).toHaveBeenCalled());

    await user.click(screen.getByText("Nueva Reunión"));
    // El atributo HTML `required` ya bloquea un título vacío antes de llegar al
    // JS; un título de solo espacios pasa esa validación nativa pero debe caer
    // en validateMeeting() (ver lib/meetings.ts).
    await user.type(screen.getByPlaceholderText("Ej: Reunión General"), "   ");
    const dateInput = container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    await user.type(dateInput, new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 16));
    await user.type(screen.getByPlaceholderText("https://zoom.us/j/..."), "https://zoom.us/j/999");
    await user.type(screen.getByPlaceholderText("123 456 7890"), "999999");
    await user.type(screen.getByPlaceholderText("mediaagua"), "clave123");

    await user.click(screen.getByRole("button", { name: "Crear" }));

    expect(await screen.findByText(/el título es requerido/i)).toBeInTheDocument();
    expect(mockCreateMeeting).not.toHaveBeenCalled();
  });
});

describe("Dashboard — editar reunión (admin)", () => {
  it("camino feliz: precarga el formulario y guarda los cambios", async () => {
    const user = userEvent.setup();
    await renderDashboard("admin@test.com");

    await waitFor(() => expect(mockGetUpcomingMeetings).toHaveBeenCalled());

    await user.click(screen.getByTitle("Editar"));

    const titleInput = await screen.findByDisplayValue("Reunión General");
    await user.clear(titleInput);
    await user.type(titleInput, "Reunión Editada");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mockUpdateMeeting).toHaveBeenCalledTimes(1));
    expect(mockUpdateMeeting).toHaveBeenCalledWith(
      "abc123",
      expect.objectContaining({ title: "Reunión Editada" })
    );
  });
});

describe("Dashboard — eliminar reunión (admin)", () => {
  it("camino feliz: confirma y elimina", async () => {
    const user = userEvent.setup();
    await renderDashboard("admin@test.com");

    await waitFor(() => expect(mockGetUpcomingMeetings).toHaveBeenCalled());

    await user.click(screen.getByTitle("Eliminar"));
    const dialog = await screen.findByText(/¿Eliminar reunión\?/i);
    const dialogContainer = dialog.closest("div")?.parentElement as HTMLElement;
    await user.click(within(dialogContainer).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(mockDeleteMeeting).toHaveBeenCalledWith("abc123"));
  });

  it("borde: cancelar el modal no elimina la reunión", async () => {
    const user = userEvent.setup();
    await renderDashboard("admin@test.com");

    await waitFor(() => expect(mockGetUpcomingMeetings).toHaveBeenCalled());

    await user.click(screen.getByTitle("Eliminar"));
    const dialog = await screen.findByText(/¿Eliminar reunión\?/i);
    const dialogContainer = dialog.closest("div")?.parentElement as HTMLElement;
    await user.click(within(dialogContainer).getByRole("button", { name: "Cancelar" }));

    expect(mockDeleteMeeting).not.toHaveBeenCalled();
    expect(screen.getByText("Reunión General")).toBeInTheDocument();
  });
});
