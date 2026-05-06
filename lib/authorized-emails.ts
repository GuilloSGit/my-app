// GitHub Pages doesn't properly expose NEXT_PUBLIC_* variables in runtime
// Fallback to hardcoded values for production
const authorizedEmails = process.env.NEXT_PUBLIC_AUTHORIZED_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [
  "guillermoandrada@gmail.com",
  "leootarola.321@gmail.com", 
  "lg9536590@gmail.com",
  "emilioeduardo933@gmail.com",
  "pelayesthiago2@gmail.com",
  "congregacionmediaagua7146@gmail.com"
];

export function isAuthorizedEmail(email: string): boolean {
  return authorizedEmails.includes(email.toLowerCase().trim());
}

export function getAuthorizedEmails(): string[] {
  return authorizedEmails;
}
