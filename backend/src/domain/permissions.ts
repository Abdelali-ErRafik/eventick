import type { Role } from "./auth.js";

/**
 * The permission vocabulary.
 *
 * A permission answers "may this person do this KIND of thing at all" — never
 * "to whose data". Row ownership stays an ownership check in the route
 * (`event.organiserId === user.id`); conflating the two is exactly how one
 * organiser ends up able to edit another's events.
 *
 * `scope.any` is the one that looks like an exception and isn't: it is the
 * capability to act outside your own rows, which used to be spelled
 * `&& role !== "ADMIN"` by hand in eleven different places. Modelling it as a
 * permission is what stops the most dangerous rule in the system from being
 * the one piece still hardcoded while everything else became data.
 */
export const PERMISSIONS = {
  "events.manage": "Create, edit, hide and delete events, and manage their ticket tiers",
  "orders.manage": "View orders, admit and re-issue tickets, cancel and delete orders",
  "gate.checkin": "Check tickets in at the door and download the offline manifest",
  "finance.view": "View revenue, payout and platform-fee figures",
  "finance.refund": "Refund an order, in full or in part",
  "promo.manage": "Create, edit and delete promotional codes",
  "uploads.create": "Upload event images",
  "users.manage": "List users and change their roles",
  "scope.any": "Act on any organiser's data, not only your own",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}

/**
 * What each role may do out of the box.
 *
 * This is the SEED, not the runtime authority: once seeded, the grants live in
 * role_permissions rows and an admin may change them there. Authorisation
 * always reads the database (see resolvePermissions), never this object —
 * otherwise "permissions are data" would be a lie.
 *
 * These lists reproduce the pre-RBAC behaviour exactly: ORGANISER gets what
 * `requireRole("ORGANISER","ADMIN")` used to let through, ADMIN additionally
 * gets user management and the cross-organiser bypass that was hardcoded as
 * `role !== "ADMIN"`. CUSTOMER holds nothing — every customer-facing route is
 * public, token-credentialed, or scoped to the caller's own rows, so a
 * customer never passed a role gate even before this.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  CUSTOMER: [],
  ORGANISER: [
    "events.manage",
    "orders.manage",
    "gate.checkin",
    "finance.view",
    "finance.refund",
    "promo.manage",
    "uploads.create",
  ],
  ADMIN: [
    "events.manage",
    "orders.manage",
    "gate.checkin",
    "finance.view",
    "finance.refund",
    "promo.manage",
    "uploads.create",
    "users.manage",
    "scope.any",
  ],
};

/**
 * Grants that cannot be revoked, because revoking them is unrecoverable.
 *
 * An admin stripping `users.manage` from ADMIN would lock every admin out of
 * user management permanently — including out of the screen needed to undo
 * it. Re-running the seed would not help: it upserts and never restores a
 * deleted grant. So this one pairing is enforced in code and refused at the
 * API, which is the deliberate exception to "a role's powers are data".
 */
export const LOCKED_GRANTS: ReadonlyArray<{ role: Role; permission: Permission }> = [
  { role: "ADMIN", permission: "users.manage" },
];

export function isLockedGrant(role: Role, permission: string): boolean {
  return LOCKED_GRANTS.some((grant) => grant.role === role && grant.permission === permission);
}
