import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/login/page";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/login",
}));

const { mockSignInWithOtp, mockGetSession, mockOnAuthStateChange } = vi.hoisted(() => ({
  mockSignInWithOtp: vi.fn(),
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOtp: mockSignInWithOtp,
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_AUTHORIZED_EMAILS", "guillermoandrada@gmail.com");
  mockPush.mockClear();
  mockSignInWithOtp.mockReset().mockResolvedValue({ error: null });
  mockGetSession.mockReset().mockResolvedValue({ data: { session: null } });
  mockOnAuthStateChange.mockReset().mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("LoginPage", () => {
  it("email no inscripto: no llama a Supabase y muestra un mensaje prudente", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("tu@email.com"), "intruso@gmail.com");
    await user.click(screen.getByRole("button", { name: /enviar enlace de acceso/i }));

    const error = await screen.findByText(/no está autorizado para acceder/i);
    expect(error).toBeInTheDocument();
    expect(mockSignInWithOtp).not.toHaveBeenCalled();

    // El mensaje no debe filtrar detalles de arquitectura (Supabase, DB, tablas, etc.)
    expect(error.textContent?.toLowerCase()).not.toMatch(/supabase|database|sql|tabla/);
  });

  it("email autorizado: llama a Supabase y muestra 'revisá tu correo'", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("tu@email.com"), "guillermoandrada@gmail.com");
    await user.click(screen.getByRole("button", { name: /enviar enlace de acceso/i }));

    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalledTimes(1));
    expect(mockSignInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "guillermoandrada@gmail.com" })
    );

    expect(await screen.findByText(/revisá tu correo/i)).toBeInTheDocument();
  });

  it("si Supabase devuelve error, lo muestra tal cual (sin redirigir)", async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: "Demasiados intentos, esperá un minuto" } });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("tu@email.com"), "guillermoandrada@gmail.com");
    await user.click(screen.getByRole("button", { name: /enviar enlace de acceso/i }));

    expect(await screen.findByText(/demasiados intentos/i)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("si ya hay sesión activa, redirige a /dashboard", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: "guillermoandrada@gmail.com" } } },
    });

    render(<LoginPage />);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));
  });
});
