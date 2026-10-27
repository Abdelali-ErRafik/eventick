import pino from "pino";

/** Shared logger for code outside the request cycle (pino-http covers requests). */
export const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
