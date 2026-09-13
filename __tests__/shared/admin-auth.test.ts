import { describe, it, expect } from "vitest";
import { isAdminEmail } from "@/supabase/functions/_shared/admin-auth";

const ADMIN_EMAILS = "admin@example.com,otro-admin@example.com";

describe("isAdminEmail", () => {
  it("acepta un email admin exacto", () => {
    expect(isAdminEmail("admin@example.com", ADMIN_EMAILS)).toBe(true);
  });

  it("es case-insensitive y tolera espacios en la lista", () => {
    expect(isAdminEmail("Admin@Example.com", " admin@example.com , otro-admin@example.com ")).toBe(true);
  });

  it("rechaza un email que no está en la lista", () => {
    expect(isAdminEmail("otro@example.com", ADMIN_EMAILS)).toBe(false);
  });

  it("rechaza email vacío o undefined", () => {
    expect(isAdminEmail(null, ADMIN_EMAILS)).toBe(false);
    expect(isAdminEmail(undefined, ADMIN_EMAILS)).toBe(false);
  });

  it("rechaza cuando la env var de admins no está seteada", () => {
    expect(isAdminEmail("admin@example.com", undefined)).toBe(false);
    expect(isAdminEmail("admin@example.com", "")).toBe(false);
  });
});
