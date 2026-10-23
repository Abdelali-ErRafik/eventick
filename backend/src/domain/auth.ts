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
