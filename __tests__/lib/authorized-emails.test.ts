import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("isAuthorizedEmail", () => {
  it("retorna true para email autorizado", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHORIZED_EMAILS", "user@test.com,otro@test.com");
    const { isAuthorizedEmail } = await import("@/lib/authorized-emails");
    expect(isAuthorizedEmail("user@test.com")).toBe(true);
  });

  it("retorna false para email no autorizado", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHORIZED_EMAILS", "user@test.com");
    const { isAuthorizedEmail } = await import("@/lib/authorized-emails");
    expect(isAuthorizedEmail("intruso@test.com")).toBe(false);
  });

  it("la comparación es case-insensitive", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHORIZED_EMAILS", "User@Test.COM");
    const { isAuthorizedEmail } = await import("@/lib/authorized-emails");
    expect(isAuthorizedEmail("user@test.com")).toBe(true);
  });

  it("trimea espacios en el email ingresado", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHORIZED_EMAILS", "user@test.com");
    const { isAuthorizedEmail } = await import("@/lib/authorized-emails");
    expect(isAuthorizedEmail("  user@test.com  ")).toBe(true);
  });

  it("soporta múltiples emails separados por comas", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHORIZED_EMAILS", "a@a.com,b@b.com,c@c.com");
    const { isAuthorizedEmail } = await import("@/lib/authorized-emails");
    expect(isAuthorizedEmail("b@b.com")).toBe(true);
    expect(isAuthorizedEmail("d@d.com")).toBe(false);
  });
});

describe("getAuthorizedEmails", () => {
  it("retorna arreglo de emails", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHORIZED_EMAILS", "a@a.com,b@b.com");
    const { getAuthorizedEmails } = await import("@/lib/authorized-emails");
    expect(getAuthorizedEmails()).toContain("a@a.com");
    expect(getAuthorizedEmails()).toContain("b@b.com");
  });
});
