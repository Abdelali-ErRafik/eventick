import "dotenv/config";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { assertPaymentConfig } from "./lib/stripe.js";
import { assertAuthConfig } from "./lib/jwt.js";
import { closeRealtime, initRealtime } from "./lib/realtime.js";
import { startSweeper, stopSweeper } from "./lib/sweeper.js";

// Refuse to boot a production host in mock payment mode, where every order
// would be marked paid without charging a card.
assertPaymentConfig();
// Likewise refuse a forgeable JWT secret: with one, anybody can mint a token
// for any user and any role.
assertAuthConfig();

const port = Number(process.env.PORT ?? 4100);
const app = createApp();

const server = app.listen(port, () => {
  console.log(`Eventick API listening on :${port}`);
});

// Shares the HTTP server, so realtime needs no extra port or config.
initRealtime(server);

// Lapsed waitlist offers and abandoned carts go stale on a clock, not on a
// request, so something has to come looking for them.
startSweeper();

async function shutdown() {
  console.log("Shutting down...");
  closeRealtime();
  stopSweeper();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
