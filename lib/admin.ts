import { AuthUser } from "./auth";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "";

export function isAdmin(user: AuthUser | null): boolean {
  if (!user?.email || !ADMIN_EMAIL) return false;
  return user.email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();
}

export function getAdminEmail(): string {
  return ADMIN_EMAIL;
}
