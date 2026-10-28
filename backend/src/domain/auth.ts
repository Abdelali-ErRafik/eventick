export const ROLES = ["CUSTOMER", "ORGANISER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

/** Self-registration may only create customer accounts. */
export const PUBLIC_SIGNUP_ROLE: Role = "CUSTOMER";

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function hasRole(role: Role, allowed: Role[]): boolean {
  return allowed.includes(role);
}

/**
 * @deprecated Being retired in favour of the `scope.any` permission.
 *
 * "May act outside your own rows" is a capability, so it belongs in the
 * permission tables like every other one — otherwise the single most
 * dangerous rule in the system stays hardcoded while the rest became data.
 * Call `userHasPermission(user, "scope.any")` instead. Kept only until the
 * last caller is gone.
 */
export function isPlatformAdmin(role: string): boolean {
  return role === "ADMIN";
}

/**
 * The Prisma `where` fragment that scopes an organiser-owned resource to the
 * caller: only their own rows, unless they may act platform-wide.
 *
 * Centralised here because the same ternary used to be hand-copied at every
 * call site, which is how it drifted — some list routes had it, some didn't,
 * while all of them sat on the same /pro dashboard.
 *
 * `mayActAnywhere` is passed in rather than resolved here so this stays a
 * pure function: the permission lookup is async and belongs to the caller,
 * which already has it in hand.
 *
 * `organiserId` lets a platform-wide caller narrow back down to one
 * organiser (via a `?organiserId=` query param). It must never take effect
 * for anyone else, since that would let one organiser read another's data —
 * which is why it is ignored entirely unless `mayActAnywhere`.
 */
export function organiserScope(
  user: { id: string },
  mayActAnywhere: boolean,
  organiserId?: string,
): { organiserId?: string } {
  if (!mayActAnywhere) return { organiserId: user.id };
  return organiserId ? { organiserId } : {};
}
