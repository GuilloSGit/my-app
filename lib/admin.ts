import { AuthUser } from "./auth";

// GitHub Pages doesn't properly expose NEXT_PUBLIC_* variables in runtime
// Fallback to hardcoded values for production
const ADMIN_EMAILS = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "guillermoandrada@gmail.com,pelayesthiago2@gmail.com,congregacionmediaagua7146@gmail.com";

export function isAdmin(user: AuthUser | null): boolean {
  if (!user?.email || !ADMIN_EMAILS) return false;
  
  const adminList = ADMIN_EMAILS.split(",").map(email => email.toLowerCase().trim());
  return adminList.includes(user.email.toLowerCase().trim());
}

export function getAdminEmails(): string[] {
  return ADMIN_EMAILS.split(",").map(email => email.trim()).filter(Boolean);
}
