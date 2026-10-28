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

export function isPlatformAdmin(role: string): boolean {
  return role === "ADMIN";
}

/**
 * The Prisma `where` fragment that scopes an organiser-owned resource to the
 * caller: every other organiser's rows for a plain ORGANISER, everyone's for
 * an ADMIN. Centralised here because the same `role === "ADMIN" ? {} : {
 * organiserId }` ternary used to be hand-copied at every call site, which is
 * how it drifted — some list routes had it, some didn't, while all of them
 * sat on the same /pro dashboard.
 *
 * `organiserId` lets an admin narrow back down to one organiser (via a
 * `?organiserId=` query param); it must never reach a plain ORGANISER's
 * request, since that would let them read another organiser's data — gate
 * it with `isPlatformAdmin` before passing it in, never trust it bare.
 */
export function organiserScope(user: { id: string; role: string }, organiserId?: string): { organiserId?: string } {
  if (!isPlatformAdmin(user.role)) return { organiserId: user.id };
  return organiserId ? { organiserId } : {};
}
