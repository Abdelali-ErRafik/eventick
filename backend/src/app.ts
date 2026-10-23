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
import { errorHandler, HttpError } from "./lib/http.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());

  const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3100").split(",");
  app.use(cors({ origin: corsOrigins, credentials: true }));

  app.use(express.json());
  app.use(pinoHttp({ autoLogging: { ignore: (req) => req.url === "/api/health" } }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/organiser", organiserRouter);
  app.use("/api/gate", gateRouter);
  app.use("/api/promo", promoRouter);

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

  app.use(errorHandler);

  return app;
}
