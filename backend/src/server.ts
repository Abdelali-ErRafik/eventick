import "dotenv/config";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";

const port = Number(process.env.PORT ?? 4100);
const app = createApp();

const server = app.listen(port, () => {
  console.log(`Eventick API listening on :${port}`);
});

async function shutdown() {
  console.log("Shutting down...");
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
