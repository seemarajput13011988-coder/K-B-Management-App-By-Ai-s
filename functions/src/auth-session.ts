import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}
export function passwordMatches(password: string, salt: string, expectedHash: string): boolean {
  if (!password || !salt || !expectedHash) return false;
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function newPasswordFields(password: string) {
  const salt = randomBytes(16).toString('hex');
  return { salt, passwordHash: hashPassword(password, salt) };
}
export function sessionTokenId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function isSessionActive(expiresAt: unknown, currentTime = Date.now()): boolean {
  return typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > currentTime;
}
export function roleAllowed(role: string, allowedRoles: readonly string[]): boolean {
  return allowedRoles.includes(role);
}
export function canAccessStaffRecord(actor: { id: string; role: string }, record: { ownerId?: string; assignedTo?: string; userId?: string }): boolean {
  if (actor.role === 'admin') return true;
  return record.ownerId === actor.id || record.assignedTo === actor.id || record.userId === actor.id;
}
