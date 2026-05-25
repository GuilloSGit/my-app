import type { AuthUser } from "./auth";

const ADMIN_EMAILS =
  process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
  "guillermoandrada@gmail.com,pelayesthiago2@gmail.com,congregacionmediaagua7146@gmail.com";

export function isAdmin(user: AuthUser | null): boolean {
  if (!user?.email) return false;
  const adminList = ADMIN_EMAILS.split(",").map((e) => e.toLowerCase().trim());
  return adminList.includes(user.email.toLowerCase().trim());
}

export function getAdminEmails(): string[] {
  return ADMIN_EMAILS.split(",").map((e) => e.trim()).filter(Boolean);
}
