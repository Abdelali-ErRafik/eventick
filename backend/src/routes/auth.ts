import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { ADMIN_CREATABLE_ROLES, isRole, PUBLIC_SIGNUP_ROLE, ROLES, type Role } from "../domain/auth.js";
import { isLockedGrant, isPermission, PERMISSION_KEYS, PERMISSIONS } from "../domain/permissions.js";
import { invalidatePermissionCache, permissionListForRole } from "../lib/permissions.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Everyone's own identity, as the SPA's AuthContext consumes it.
 *
 * `permissions` is a required argument rather than something resolved in
 * here, because this is called from four places and two of them (register,
 * login) never pass through `authenticate` and so have no resolved list in
 * hand. Making it explicit forces each call site to fetch it rather than
 * silently shipping a user object with the field missing — which the
 * frontend would read as "no permissions" and quietly hide every control.
 */
function publicUser(
  user: { id: string; name: string; email: string; role: string },
  permissions: string[],
) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, permissions };
}

/** The caller's permission list, or [] for a role that somehow isn't valid. */
async function permissionsOf(user: { role: string }): Promise<string[]> {
  return isRole(user.role) ? permissionListForRole(user.role) : [];
}

// A separate shape from publicUser, not an extension of it: /auth/me is
// everyone's own identity and should stay a frozen, minimal contract, while
// the admin-only user list can carry counts (and later, more) an ordinary
// user has no business seeing about themselves or anyone else.
function adminUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  _count: { events: number; orders: number };
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    eventCount: user._count.events,
    orderCount: user._count.orders,
  };
}

authRouter.post(
  "/register",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new HttpError(422, "An account with this email already exists");

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash, role: PUBLIC_SIGNUP_ROLE },
    });
    const token = signToken({ sub: user.id, role: user.role });
    res.status(201).json({ token, user: publicUser(user, await permissionsOf(user)) });
  }),
);

authRouter.post(
  "/login",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new HttpError(401, "Invalid email or password");

    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) throw new HttpError(401, "Invalid email or password");

    const token = signToken({ sub: user.id, role: user.role });
    res.json({ token, user: publicUser(user, await permissionsOf(user)) });
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user!, await permissionsOf(req.user!)) });
  }),
);

const updateMeSchema = z.object({ name: z.string().min(2) });

authRouter.patch(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const body = updateMeSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.user!.id }, data: { name: body.name } });
    res.json({ user: publicUser(user, await permissionsOf(user)) });
  }),
);

const listUsersSchema = z.object({
  q: z.string().trim().optional(),
  role: z.enum(ROLES).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * Admin-only directory, backing the /pro/users screen. Full list, no
 * server-side pagination — every other pro screen pages client-side against
 * a fully-fetched list (see ui.jsx's Pager), so a second pagination
 * convention here would be the odd one out. The `limit` cap just guards
 * against this becoming the one unbounded response in the app; raise it (or
 * add real pagination) if the user table ever outgrows it.
 */
authRouter.get(
  "/users",
  authenticate,
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const query = listUsersSchema.parse(req.query);
    const needle = query.q?.trim();
    const users = await prisma.user.findMany({
      where: {
        ...(query.role ? { role: query.role } : null),
        ...(needle
          ? { OR: [{ name: { contains: needle, mode: "insensitive" } }, { email: { contains: needle, mode: "insensitive" } }] }
          : null),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: { select: { events: true, orders: true } },
      },
      orderBy: { createdAt: "desc" },
      take: query.limit ?? 500,
    });
    res.json({ users: users.map(adminUser) });
  }),
);

const promoteSchema = z.object({ role: z.enum(ADMIN_CREATABLE_ROLES) });

/**
 * The only way a user ever becomes an ORGANISER: an existing admin promotes
 * them. Public registration always creates CUSTOMER (see PUBLIC_SIGNUP_ROLE
 * above) so self-service signup can't grant organiser access to /pro.
 *
 * ADMIN is not a reachable target here, same restriction and same reasoning
 * as POST /users above — minting a new admin, by promotion or by creation,
 * stays exclusive to the seed/CLI, so a single compromised admin account
 * cannot cascade into creating or appointing more of itself. A role that is
 * already ADMIN is unaffected: this only constrains the role being SET, so
 * demoting an admin down to ORGANISER or CUSTOMER still works exactly as
 * before — only promotion TO admin is closed off.
 */
authRouter.patch(
  "/users/:id/role",
  authenticate,
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const body = promoteSchema.parse(req.body);

    // An admin cannot change their own role, in either direction. This is
    // the one guard that matters: as long as an admin can never demote
    // themselves, the platform can never end up with zero admins (you must
    // already be ADMIN to reach this route at all), so there is no need to
    // separately count remaining admins before a demotion.
    if (id === req.user!.id) throw new HttpError(422, "You cannot change your own role");

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "User not found");

    const user = await prisma.user.update({ where: { id }, data: { role: body.role } });
    res.json({ user: publicUser(user, await permissionsOf(user)) });
  }),
);

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(ADMIN_CREATABLE_ROLES),
});

/**
 * Create a user with a chosen role, directly.
 *
 * Deliberately NOT a variant of /register: that route is public and must
 * always produce a CUSTOMER (PUBLIC_SIGNUP_ROLE), or self-service signup
 * would be a way to mint organisers. This one is admin-only and takes an
 * explicit role — but ADMIN is not one of the choices. The database seed
 * stays the only way an admin account comes into being; this endpoint
 * widens who can create ORGANISER/CUSTOMER accounts, not who can create
 * ADMIN ones. Letting any admin mint another admin would mean a single
 * compromised admin account could cascade into as many more as it wanted.
 *
 * ADMIN_CREATABLE_ROLES is the enforcement, not a UI convention to trust:
 * zod rejects "ADMIN" here before this handler ever sees it, independent of
 * whatever the frontend's role picker happens to offer.
 *
 * Mirrors /register's hardening: same bcrypt cost, same 8-character
 * minimum, same duplicate-email 422.
 */
authRouter.post(
  "/users",
  authenticate,
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new HttpError(422, "An account with this email already exists");

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash, role: body.role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: { select: { events: true, orders: true } },
      },
    });
    res.status(201).json({ user: adminUser(user) });
  }),
);

// ─────────────────────────────────────── role → permission grants ──

/**
 * The permission catalogue plus who currently holds what.
 *
 * Reads the grants from the database rather than from DEFAULT_ROLE_
 * PERMISSIONS, because the defaults are only a seed — once an admin edits a
 * grant, the database is the authority and the constant is stale.
 */
authRouter.get(
  "/permissions",
  authenticate,
  requirePermission("users.manage"),
  asyncHandler(async (_req, res) => {
    const grants = await prisma.rolePermission.findMany({ select: { role: true, permissionKey: true } });

    const byRole: Record<string, string[]> = {};
    for (const role of ROLES) byRole[role] = [];
    for (const grant of grants) byRole[grant.role]?.push(grant.permissionKey);
    for (const role of ROLES) byRole[role].sort();

    res.json({
      permissions: PERMISSION_KEYS.map((key) => ({
        key,
        description: PERMISSIONS[key],
        locked: isLockedGrant("ADMIN", key),
      })),
      roles: byRole,
    });
  }),
);

function roleParam(req: Parameters<typeof param>[0]): Role {
  const value = param(req, "role");
  if (!isRole(value)) throw new HttpError(404, "Unknown role");
  return value;
}

const grantSchema = z.object({ permission: z.string() });

authRouter.post(
  "/roles/:role/permissions",
  authenticate,
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const role = roleParam(req);
    const { permission } = grantSchema.parse(req.body);
    if (!isPermission(permission)) throw new HttpError(404, "Unknown permission");

    await prisma.rolePermission.upsert({
      where: { role_permissionKey: { role, permissionKey: permission } },
      update: {},
      create: { role, permissionKey: permission },
    });
    // The cache is keyed by role and read on nearly every request; without
    // this the grant would take up to its TTL to appear, which looks like a
    // bug to whoever just clicked the toggle.
    invalidatePermissionCache(role);

    res.json({ role, permissions: await permissionListForRole(role) });
  }),
);

authRouter.delete(
  "/roles/:role/permissions/:permission",
  authenticate,
  requirePermission("users.manage"),
  asyncHandler(async (req, res) => {
    const role = roleParam(req);
    const permission = param(req, "permission");
    if (!isPermission(permission)) throw new HttpError(404, "Unknown permission");

    // The anti-lockout invariant. Stripping users.manage from ADMIN would
    // lock every admin out of user and permission management permanently —
    // including out of the screen needed to undo it — and re-seeding would
    // not restore it on an existing install. This is the deliberate
    // exception to "a role's powers are data".
    if (isLockedGrant(role, permission)) {
      throw new HttpError(422, "This permission cannot be removed from this role");
    }

    await prisma.rolePermission.deleteMany({ where: { role, permissionKey: permission } });
    invalidatePermissionCache(role);

    res.json({ role, permissions: await permissionListForRole(role) });
  }),
);
