import type { NextFunction, Request, Response } from "express";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../lib/jwt.js";
import { HttpError } from "../lib/http.js";
import { isRole, type Role } from "../domain/auth.js";

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
