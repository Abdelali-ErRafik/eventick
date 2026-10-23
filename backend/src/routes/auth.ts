import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import { authenticate } from "../middleware/auth.js";
import { PUBLIC_SIGNUP_ROLE } from "../domain/auth.js";

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
