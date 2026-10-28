import { prisma } from "./prisma.js";
import type { Role } from "../domain/auth.js";
import type { Permission } from "../domain/permissions.js";

/**
 * Permission lookup, cached per role for a few seconds.
 *
 * Deliberately NOT put in the JWT. Tokens last 30 days (lib/jwt.ts), so a
 * permission baked into one would mean revoking a capability has no effect
 * for up to a month — which would make "a role's powers are data" false in
 * the only case that matters. The same reasoning already applies to the role
 * itself: middleware/auth.ts re-reads the user every request rather than
 * trusting the token's `role` claim.
 *
 * The cache exists because this is read on nearly every authenticated
 * request and the grants change roughly never. TTL is short enough that a
 * revocation takes effect while an admin is still looking at the screen,
 * and `invalidatePermissionCache` makes it immediate for changes we make
 * ourselves.
 */
const TTL_MS = 10_000;

type Entry = { permissions: Set<string>; expiresAt: number };

const cache = new Map<Role, Entry>();

export function invalidatePermissionCache(role?: Role): void {
  if (role) cache.delete(role);
  else cache.clear();
}

export async function permissionsForRole(role: Role): Promise<Set<string>> {
  const hit = cache.get(role);
  if (hit && hit.expiresAt > Date.now()) return hit.permissions;

  const rows = await prisma.rolePermission.findMany({
    where: { role },
    select: { permissionKey: true },
  });
  const permissions = new Set(rows.map((row) => row.permissionKey));
  cache.set(role, { permissions, expiresAt: Date.now() + TTL_MS });
  return permissions;
}

export async function roleHasPermission(role: Role, permission: Permission): Promise<boolean> {
  return (await permissionsForRole(role)).has(permission);
}

/** The caller's permissions, as a sorted array — the shape /auth/me ships. */
export async function permissionListForRole(role: Role): Promise<string[]> {
  return [...(await permissionsForRole(role))].sort();
}
