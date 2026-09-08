/**
 * Identifier normalization utilities for consistent, race-safe contact resolution.
 */

export function normalizePhone(raw: string): string {
  const cleaned = raw.trim().replace(/[\s\-()]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  // Standardize digits to E.164 with leading plus
  return `+${cleaned}`;
}

export function normalizeEmail(raw: string): string {
  const trimmed = raw.trim();
  // Check for "Display Name <email@example.com>" format
  const angleMatch = /<([^>]+)>/.exec(trimmed);
  const emailPart = angleMatch ? angleMatch[1] : trimmed;
  return (emailPart || '').trim().toLowerCase();
}

export function normalizeInstagramHandle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const clean = trimmed.replace(/^@+/, '').toLowerCase();
  return clean ? `@${clean}` : '';
}
