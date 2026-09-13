// Viene de la GitHub Actions Variable NEXT_PUBLIC_AUTHORIZED_EMAILS (ver
// .github/workflows/deploy.yml) en producción, y de .env (gitignoreado) en
// desarrollo local — nunca hardcodeado acá.
const authorizedEmails =
  process.env.NEXT_PUBLIC_AUTHORIZED_EMAILS?.split(",").map((e) => e.trim().toLowerCase()) ?? [];

export function isAuthorizedEmail(email: string): boolean {
  return authorizedEmails.includes(email.toLowerCase().trim());
}

export function getAuthorizedEmails(): string[] {
  return authorizedEmails;
}
