import type { Server as HttpServer } from "node:http";
import { Server as IOServer } from "socket.io";
import { verifyToken } from "./jwt.js";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

/**
 * Realtime push for the organiser dashboard.
 *
 * Attached to the EXISTING HTTP server at /socket.io, so there is nothing
 * extra to run or configure locally. One room per organiser (`org:<userId>`):
 * an organiser only ever receives events for their own events, which is the
 * same boundary the REST routes enforce.
 *
 * Authentication happens in the handshake, not in a connection handler — a
 * rejected socket then never exists, rather than being opened and cleaned up.
 */

let io: IOServer | null = null;

export type RealtimeEvent =
  | { type: "checkin"; eventSlug: string; ref: string; holderName: string; at: string }
  | { type: "order"; eventSlug: string; orderId: string; totalCents: number; tickets: number; at: string };

export function initRealtime(httpServer: HttpServer): void {
  if (io) return;

  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3100").split(",").map((o) => o.trim());

  io = new IOServer(httpServer, {
    path: "/socket.io",
    cors: { origin: origins },
    // A gate phone's radio sleeps and the screen locks; the library defaults
    // read a brief tunnel as a dead client and force a full reconnect.
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 1e6,
    // WS first, polling as fallback — some carriers break WS upgrades, and a
    // websocket-only client then never connects at all, silently.
    transports: ["websocket", "polling"],
  });

  io.use(async (socket, next) => {
    try {
      const raw =
        (socket.handshake.auth as { token?: unknown } | undefined)?.token ??
        socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "");
      const token = typeof raw === "string" ? raw.trim() : "";
      if (!token) return next(new Error("unauthorized"));

      const payload = verifyToken(token);
      // Re-read the user so a role change or deletion applies immediately,
      // rather than lasting until the JWT expires.
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return next(new Error("unauthorized"));
      if (user.role !== "ORGANISER" && user.role !== "ADMIN") return next(new Error("forbidden"));

      socket.data.userId = user.id;
      socket.data.role = user.role;
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`org:${userId}`);
    logger.debug({ userId }, "realtime client connected");
  });

  logger.info({ path: "/socket.io" }, "realtime ready");
}

/**
 * Push an event to the organiser who owns it. Never throws: realtime is a
 * nicety layered on top of the database, and a socket problem must not fail
 * the check-in or the payment that triggered it.
 */
export function emitToOrganiser(organiserId: string | null, event: RealtimeEvent): void {
  // Seeded/platform events have no organiser — nobody to notify.
  if (!organiserId) return;
  try {
    io?.to(`org:${organiserId}`).emit("eventick", event);
  } catch (err) {
    logger.warn({ err }, "realtime emit failed");
  }
}

export function closeRealtime(): void {
  io?.close();
  io = null;
}
