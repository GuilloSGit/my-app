import type { AuthUser } from "./auth";

// Viene de la GitHub Actions Variable NEXT_PUBLIC_ADMIN_EMAIL (ver
// .github/workflows/deploy.yml) en producción, y de .env (gitignoreado) en
// desarrollo local — nunca hardcodeado acá.
const ADMIN_EMAILS = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "";

export function isAdmin(user: AuthUser | null): boolean {
  if (!user?.email) return false;
  const adminList = ADMIN_EMAILS.split(",").map((e) => e.toLowerCase().trim());
  return adminList.includes(user.email.toLowerCase().trim());
}

export function getAdminEmails(): string[] {
  return ADMIN_EMAILS.split(",").map((e) => e.trim()).filter(Boolean);
}
