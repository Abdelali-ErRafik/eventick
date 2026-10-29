import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { authRouter } from "./routes/auth.js";
import { eventsRouter } from "./routes/events.js";
import { ordersRouter } from "./routes/orders.js";
import { ticketsRouter } from "./routes/tickets.js";
import { organiserRouter } from "./routes/organiser.js";
import { gateRouter } from "./routes/gate.js";
import { promoRouter } from "./routes/promo.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { uploadsRouter, UPLOAD_DIR } from "./routes/uploads.js";
import { resaleRouter } from "./routes/resale.js";
import { shareRouter } from "./routes/share.js";
import { organiserApplicationsRouter } from "./routes/organiser-applications.js";
import { platformRouter } from "./routes/platform.js";
import { prisma } from "./lib/prisma.js";
import { errorHandler, HttpError } from "./lib/http.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());

  const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3100").split(",");
  app.use(cors({ origin: corsOrigins, credentials: true }));

  // Webhooks mount BEFORE express.json(): CMI posts form-encoded, not JSON,
  // so the router applies its own urlencoded parser.
  app.use("/api/webhooks", webhooksRouter);

  app.use(express.json());
  app.use(pinoHttp({ autoLogging: { ignore: (req) => req.url === "/api/health" || req.url === "/api/ready" } }));

  // Liveness: the process is up. Cheap enough for a frequent probe.
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Readiness: can this instance actually serve traffic? The old health check
  // returned ok:true from a literal, so it stayed green with Postgres down —
  // exactly the outage it was supposed to catch.
  app.get("/api/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, db: "up" });
    } catch {
      res.status(503).json({ ok: false, db: "down" });
    }
  });

  app.use("/api/auth", authRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/organiser", organiserRouter);
  app.use("/api/gate", gateRouter);
  app.use("/api/promo", promoRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/resale", resaleRouter);
  app.use("/api/share", shareRouter);
  app.use("/api/organiser-applications", organiserApplicationsRouter);
  app.use("/api/platform", platformRouter);

  // Serve uploaded posters. No directory listing, and the random filenames
  // mean a URL is only guessable if it was shared.
  app.use(
    "/uploads",
    express.static(UPLOAD_DIR, { index: false, maxAge: "7d", fallthrough: false }),
  );

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

  app.use(errorHandler);

  return app;
}
