import { describe, it, expect, vi, beforeEach } from "vitest";

// Controlar las variables de entorno antes de importar el módulo
beforeEach(() => {
  vi.resetModules();
});

describe("isAdmin", () => {
  it("retorna true para email admin", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAIL", "admin@test.com,otro@test.com");
    const { isAdmin } = await import("@/lib/admin");
    expect(isAdmin({ email: "admin@test.com" } as any)).toBe(true);
  });

  it("retorna false para email no admin", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAIL", "admin@test.com");
    const { isAdmin } = await import("@/lib/admin");
    expect(isAdmin({ email: "usuario@test.com" } as any)).toBe(false);
  });

  it("retorna false para user null", async () => {
    const { isAdmin } = await import("@/lib/admin");
    expect(isAdmin(null)).toBe(false);
  });

  it("la comparación es case-insensitive", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAIL", "Admin@Test.com");
    const { isAdmin } = await import("@/lib/admin");
    expect(isAdmin({ email: "admin@test.com" } as any)).toBe(true);
  });

  it("soporta múltiples admins separados por comas", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAIL", "a@a.com,b@b.com,c@c.com");
    const { isAdmin } = await import("@/lib/admin");
    expect(isAdmin({ email: "b@b.com" } as any)).toBe(true);
    expect(isAdmin({ email: "c@c.com" } as any)).toBe(true);
    expect(isAdmin({ email: "d@d.com" } as any)).toBe(false);
  });
});

describe("getAdminEmails", () => {
  it("retorna lista de emails sin espacios", async () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_EMAIL", "a@a.com, b@b.com , c@c.com");
    const { getAdminEmails } = await import("@/lib/admin");
    expect(getAdminEmails()).toEqual(["a@a.com", "b@b.com", "c@c.com"]);
  });
});
