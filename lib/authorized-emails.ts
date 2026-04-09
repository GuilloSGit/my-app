const authorizedEmails = process.env.NEXT_PUBLIC_AUTHORIZED_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];

export function isAuthorizedEmail(email: string): boolean {
  return authorizedEmails.includes(email.toLowerCase().trim());
}

export function getAuthorizedEmails(): string[] {
  return authorizedEmails;
}
