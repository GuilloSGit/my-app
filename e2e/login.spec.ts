import { test, expect } from "@playwright/test";
import { installMockSupabase } from "./helpers/mock-supabase";

test.describe("Login", () => {
  test("email no inscripto: mensaje prudente, sin llamar a Supabase", async ({ page }) => {
    await installMockSupabase(page, { session: null });
    await page.goto("/login");

    await page.getByPlaceholder("tu@email.com").fill("intruso@gmail.com");
    await page.getByRole("button", { name: /enviar enlace de acceso/i }).click();

    const error = page.getByText(/no está autorizado para acceder/i);
    await expect(error).toBeVisible();
    await expect(error).not.toContainText(/supabase|database|sql|tabla/i);
  });

  test("email autorizado: muestra 'revisá tu correo'", async ({ page }) => {
    await installMockSupabase(page, { session: null, signInWithOtpError: null });
    await page.goto("/login");

    await page.getByPlaceholder("tu@email.com").fill("guillermoandrada@gmail.com");
    await page.getByRole("button", { name: /enviar enlace de acceso/i }).click();

    await expect(page.getByText(/revisá tu correo/i)).toBeVisible();
  });

  test("visitar /dashboard sin sesión redirige a /login", async ({ page }) => {
    await installMockSupabase(page, { session: null });
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login\/?$/);
  });
});
