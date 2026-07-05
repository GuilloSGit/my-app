import { test, expect } from "@playwright/test";
import { installMockSupabase } from "./helpers/mock-supabase";

const admin = { email: "guillermoandrada@gmail.com" };

function futureLocalDateTime(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

test.describe("Dashboard — reuniones", () => {
  test("camino feliz: crear una reunión y verla en la lista", async ({ page }) => {
    await installMockSupabase(page, { session: admin, meetings: [] });
    await page.goto("/dashboard");

    await page.getByText("Nueva Reunión").click();
    await page.getByPlaceholder("Ej: Reunión General").fill("Reunión E2E");
    await page.locator('input[type="datetime-local"]').fill(futureLocalDateTime(2));
    await page.getByPlaceholder("https://zoom.us/j/...").fill("https://zoom.us/j/555");
    await page.getByPlaceholder("123 456 7890").fill("555555");
    await page.getByPlaceholder("mediaagua").fill("clave-e2e");
    await page.getByRole("button", { name: "Crear" }).click();

    await expect(page.getByText("Reunión E2E")).toBeVisible();
  });

  test("editar una reunión existente actualiza el título en la lista", async ({ page }) => {
    await installMockSupabase(page, {
      session: admin,
      meetings: [
        {
          id: "m1",
          title: "Reunión Original",
          date: futureLocalDateTime(1) + ":00-03:00",
          zoom_link: "https://zoom.us/j/1",
          zoom_id: "111",
          passcode: "p1",
        },
      ],
    });
    await page.goto("/dashboard");

    await expect(page.getByText("Reunión Original")).toBeVisible();
    await page.getByTitle("Editar").click();

    await page.getByPlaceholder("Ej: Reunión General").fill("Reunión Actualizada");
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText("Reunión Actualizada")).toBeVisible();
    await expect(page.getByText("Reunión Original")).not.toBeVisible();
  });

  test("eliminar una reunión la quita de la lista", async ({ page }) => {
    await installMockSupabase(page, {
      session: admin,
      meetings: [
        {
          id: "m2",
          title: "Reunión a Borrar",
          date: futureLocalDateTime(1) + ":00-03:00",
          zoom_link: "https://zoom.us/j/2",
          zoom_id: "222",
          passcode: "p2",
        },
      ],
    });
    await page.goto("/dashboard");

    await expect(page.getByText("Reunión a Borrar")).toBeVisible();
    await page.getByTitle("Eliminar").click();
    // El botón de confirmación es el único que tiene el texto visible "Eliminar";
    // el ícono que abre el modal solo tiene `title`, no texto, así que no colisionan.
    await page.locator("button", { hasText: "Eliminar" }).click();

    await expect(page.getByText("Reunión a Borrar")).not.toBeVisible();
  });

  test("borde: cancelar el modal de borrado conserva la reunión", async ({ page }) => {
    await installMockSupabase(page, {
      session: admin,
      meetings: [
        {
          id: "m3",
          title: "Reunión Segura",
          date: futureLocalDateTime(1) + ":00-03:00",
          zoom_link: "https://zoom.us/j/3",
          zoom_id: "333",
          passcode: "p3",
        },
      ],
    });
    await page.goto("/dashboard");

    await page.getByTitle("Eliminar").click();
    await page.getByRole("button", { name: "Cancelar" }).click();

    await expect(page.getByRole("heading", { name: "Reunión Segura" })).toBeVisible();
  });

  test("un usuario no-admin no ve acciones de administración", async ({ page }) => {
    await installMockSupabase(page, {
      session: { email: "miembro@test.com" },
      meetings: [
        {
          id: "m4",
          title: "Reunión Visible",
          date: futureLocalDateTime(1) + ":00-03:00",
          zoom_link: "https://zoom.us/j/4",
          zoom_id: "444",
          passcode: "p4",
        },
      ],
    });
    await page.goto("/dashboard");

    await expect(page.getByText("Reunión Visible")).toBeVisible();
    await expect(page.getByText("Nueva Reunión")).toHaveCount(0);
    await expect(page.getByTitle("Editar")).toHaveCount(0);
    await expect(page.getByTitle("Eliminar")).toHaveCount(0);
  });
});
