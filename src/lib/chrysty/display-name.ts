export function getFirstName(fullName: string | null | undefined, email: string): string {
  const trimmed = fullName?.trim();
  if (trimmed) return trimmed.split(/\s+/)[0] ?? trimmed;
  return email.split('@')[0] ?? email;
}
