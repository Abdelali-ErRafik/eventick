import jwt from "jsonwebtoken";

const DEV_FALLBACK_SECRET = "dev-secret-change-me";

function resolveSecret(): string {
  const configured = process.env.JWT_SECRET;
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    // Never sign tokens with a public fallback in production — that would
    // let anyone forge a valid session for any user/role.
    throw new Error("JWT_SECRET must be set in production");
  }
  return DEV_FALLBACK_SECRET;
}

const SECRET = resolveSecret();

export type JwtPayload = { sub: string; role: string };

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
