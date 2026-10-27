import rateLimit from "express-rate-limit";

// No blanket per-IP limiter on the whole API by design — only auth is
// throttled. A general limiter easily breaks real checkout sessions that
// make several calls in a burst (cart, quote, confirm).
export const authRateLimit = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many attempts. Please wait and try again." },
});

// Mass email is the one route where a mistake is expensive and irreversible —
// a loop or a double-click would mail every buyer twice.
export const broadcastRateLimit = rateLimit({
  windowMs: Number(process.env.BROADCAST_RATE_LIMIT_WINDOW_MS ?? 60 * 60 * 1000),
  max: Number(process.env.BROADCAST_RATE_LIMIT_MAX ?? 6),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many broadcasts. Please wait before sending again." },
});
