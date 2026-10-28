import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { PUBLIC_SIGNUP_ROLE, ROLES } from "../domain/auth.js";

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

function publicUser(user: { id: string; name: string; email: string; role: string }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
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
    res.status(201).json({ token, user: publicUser(user) });
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
    res.json({ token, user: publicUser(user) });
  }),
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user!) });
  }),
);

const updateMeSchema = z.object({ name: z.string().min(2) });

authRouter.patch(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const body = updateMeSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.user!.id }, data: { name: body.name } });
    res.json({ user: publicUser(user) });
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
  requireRole("ADMIN"),
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

const promoteSchema = z.object({ role: z.enum(ROLES) });

/**
 * The only way a user ever becomes an ORGANISER or ADMIN: an existing admin
 * promotes them. Public registration always creates CUSTOMER (see
 * PUBLIC_SIGNUP_ROLE above) so self-service signup can't grant organiser
 * access to /pro. The very first admin has to come from the seed script.
 */
authRouter.patch(
  "/users/:id/role",
  authenticate,
  requireRole("ADMIN"),
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
    res.json({ user: publicUser(user) });
  }),
);
