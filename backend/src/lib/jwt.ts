import jwt from "jsonwebtoken";

const DEV_FALLBACK_SECRET = "dev-secret-change-me";

/** Shortest secret worth signing with. Anything this size can be brute-forced
 * offline from a single captured token, and forging a token means forging any
 * user and any role. */
const MIN_SECRET_LENGTH = 32;

/** Secrets that are technically set but publicly known, so no better than
 * none at all — the dev fallback and the usual placeholders. */
const KNOWN_WEAK = new Set([
  DEV_FALLBACK_SECRET,
  "secret",
  "changeme",
  "change-me",
  "jwt-secret",
  "your-secret-here",
  "supersecret",
]);

/**
 * Resolves the signing secret, refusing anything forgeable in production.
 *
 * Checking only that the variable is SET was not enough: `JWT_SECRET=x`
 * passed, and a one-character secret is recovered from one captured token in
 * moments. A weak secret in production is the same vulnerability as no secret
 * at all, so it is the same error.
 */
export function resolveSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.JWT_SECRET?.trim();

  if (env.NODE_ENV === "production") {
    if (!configured) throw new Error("JWT_SECRET must be set in production");
    if (KNOWN_WEAK.has(configured.toLowerCase())) {
      throw new Error("JWT_SECRET is a known placeholder value — set a real secret in production");
    }
    if (configured.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production (got ${configured.length})`,
      );
    }
    return configured;
  }

  return configured || DEV_FALLBACK_SECRET;
}

const SECRET = resolveSecret();

/** Boot-time check. Importing this module already resolves the secret, so the
 * call exists to make the requirement explicit in server.ts next to the
 * payment guard — a misconfigured host should die at startup with a clear
 * reason, not on whichever request first needs a token. */
export function assertAuthConfig(): void {
  void SECRET;
}

export type JwtPayload = { sub: string; role: string };

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}
