import { test, expect } from "@playwright/test";
import { installMockSupabase } from "./helpers/mock-supabase";

const admin = { email: "guillermoandrada@gmail.com" };

function futureIso(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
}

test.describe("Dashboard — reuniones (meeting_occurrences)", () => {
  test("camino feliz: una ocurrencia sincronizada aparece con su link real", async ({ page }) => {
    await installMockSupabase(page, {
      session: admin,
      occurrences: [
        {
          id: "occ1",
          starts_at: futureIso(2),
          duration_minutes: 120,
          topic: "Reunión de entresemana - Jueves",
          agenda: "Lectura de la Biblia: Proverbios 1\nhttps://wol.jw.org/x",
          zoom_meeting_id: 1234567890,
          join_url: "https://jworg.zoom.us/j/1234567890",
          passcode: "clave-e2e",
          status: "synced",
          meeting_schedules: { kind: "midweek" },
        },
      ],
    });
    await page.goto("/dashboard");

    await expect(page.getByText("Reunión de entresemana - Jueves")).toBeVisible();
    await expect(page.getByRole("link", { name: "Unirse a Zoom" })).toHaveAttribute(
      "href",
      "https://jworg.zoom.us/j/1234567890",
    );
  });

  test("una ocurrencia 'pending' (sin link todavía) no aparece en la lista", async ({ page }) => {
    await installMockSupabase(page, {
      session: admin,
      occurrences: [
        {
          id: "occ2",
          starts_at: futureIso(2),
          duration_minutes: 120,
          topic: "Reunión Pendiente",
          status: "pending",
          join_url: null,
          meeting_schedules: { kind: "midweek" },
        },
      ],
    });
    await page.goto("/dashboard");

    await expect(page.getByText("No hay reuniones programadas")).toBeVisible();
    await expect(page.getByText("Reunión Pendiente")).toHaveCount(0);
  });

  test("un admin ve el link a Automatización, sin botones del flujo manual viejo", async ({ page }) => {
    await installMockSupabase(page, {
      session: admin,
      occurrences: [
        {
          id: "occ3",
          starts_at: futureIso(1),
          duration_minutes: 90,
          topic: "Reunión de fin de semana",
          zoom_meeting_id: 111,
          join_url: "https://jworg.zoom.us/j/111",
          passcode: "p1",
          status: "synced",
          meeting_schedules: { kind: "weekend" },
        },
      ],
    });
    await page.goto("/dashboard");

    await expect(page.getByText("Automatización (vista de mes)")).toBeVisible();
    await expect(page.getByText("Nueva Reunión")).toHaveCount(0);
    await expect(page.getByText("Importar CSV")).toHaveCount(0);
    await expect(page.getByText("Pegar desde Zoom")).toHaveCount(0);
  });

  test("un usuario no-admin no ve el panel de administración", async ({ page }) => {
    await installMockSupabase(page, {
      session: { email: "miembro@test.com" },
      occurrences: [
        {
          id: "occ4",
          starts_at: futureIso(1),
          duration_minutes: 90,
          topic: "Reunión Visible",
          zoom_meeting_id: 444,
          join_url: "https://jworg.zoom.us/j/444",
          passcode: "p4",
          status: "synced",
          meeting_schedules: { kind: "weekend" },
        },
      ],
    });
    await page.goto("/dashboard");

    await expect(page.getByText("Reunión Visible")).toBeVisible();
    await expect(page.getByText("Panel de Administración:")).toHaveCount(0);
    await expect(page.getByText("Automatización (vista de mes)")).toHaveCount(0);
  });
});
