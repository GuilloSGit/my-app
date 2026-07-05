import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Dominio reservado (RFC 2606) que nunca resuelve: si algún test se
      // "escapa" del mock de window.__E2E_SUPABASE__, falla ruidosamente en
      // vez de pegarle por accidente al Supabase real. Ver e2e/helpers/mock-supabase.ts.
      NEXT_PUBLIC_SUPABASE_URL: "https://e2e-placeholder.invalid",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-placeholder-anon-key",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_AUTHORIZED_EMAILS: "guillermoandrada@gmail.com",
      NEXT_PUBLIC_ADMIN_EMAIL: "guillermoandrada@gmail.com",
    },
  },
});
