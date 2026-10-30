import type { NextFunction, Request, Response } from "express";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../lib/jwt.js";
import { HttpError } from "../lib/http.js";
import { isRole, type Role } from "../domain/auth.js";
import type { Permission } from "../domain/permissions.js";
import { roleHasPermission } from "../lib/permissions.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

async function resolveUser(req: Request): Promise<User | null> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    return await prisma.user.findUnique({ where: { id: payload.sub } });
  } catch {
    return null;
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const user = await resolveUser(req);
  if (!user) {
    next(new HttpError(401, "Authentication required"));
    return;
  }
  req.user = user;
  next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  req.user = (await resolveUser(req)) ?? undefined;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new HttpError(401, "Authentication required"));
      return;
    }
    if (!isRole(req.user.role) || !roles.includes(req.user.role)) {
      next(new HttpError(403, "Forbidden"));
      return;
    }
    next();
  };
}

/**
 * Gate a route on a capability rather than on who the caller happens to be.
 *
 * 401 only when nobody is signed in; an authenticated caller who simply
 * lacks the permission gets 403. That distinction matters beyond tidiness:
 * the SPA signs the user out on any 401 (frontend/src/api.js dispatches
 * `eventick:unauthorized`), so 401-ing a merely-unpermitted request would
 * eject someone from the dashboard instead of showing them a forbidden
 * state.
 */
export function requirePermission(permission: Permission) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(new HttpError(401, "Authentication required"));
      return;
    }
    if (!isRole(req.user.role)) {
      next(new HttpError(403, "Forbidden"));
      return;
    }
    try {
      if (!(await roleHasPermission(req.user.role, permission))) {
        next(new HttpError(403, "Forbidden"));
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * The in-route form, for checks that cannot be middleware because they sit
 * inside an ownership test — "may I touch rows that are not mine".
 */
export async function userHasPermission(
  user: { role: string } | undefined,
  permission: Permission,
): Promise<boolean> {
  if (!user || !isRole(user.role)) return false;
  return roleHasPermission(user.role, permission);
}

/**
 * Refuse a purchase made from a staff account.
 *
 * Deliberately a ROLE check, not a permission. Every other gate here asks
 * "may this person do X", and the answer is a grant an admin can hand out.
 * This asks the opposite — "is this person the kind of account that buys" —
 * and there is no coherent grant to model it with: an inverse permission
 * ("may NOT buy") would invert the meaning of every other row in the table,
 * and gating on `events.manage` would silently re-permit an organiser the
 * moment that grant was revoked for an unrelated reason.
 *
 * `Protected` in the SPA documents the same carve-out: gate on capability
 * wherever possible, keep `roles` for the rare case that genuinely means
 * "is this person a CUSTOMER". This is that case.
 *
 * Guests are untouched: no session means no role, and buying without an
 * account is the normal path (see optionalAuth on /hold and /pay).
 */
export function refuseStaffPurchase(req: Request, _res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (role === "ORGANISER" || role === "ADMIN") {
    next(
      new HttpError(
        403,
        "This account manages ticketing and cannot buy tickets. Use a personal account to book.",
      ),
    );
    return;
  }
  next();
}
