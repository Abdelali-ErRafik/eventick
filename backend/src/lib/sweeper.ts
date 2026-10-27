import { prisma } from "./prisma.js";
import { expireStaleOffers, offerFreedSeats } from "./waitlist.js";
import { logger } from "./logger.js";

/**
 * Background sweep for state that goes stale on a clock rather than on a
 * request.
 *
 * Expiry used to be lazy: `expireStaleOffers` only ran when something else
 * happened to free a seat. On a quiet event nothing ever did, so a lapsed
 * offer sat showing as OFFERED on the organiser's dashboard and the person
 * behind it was never moved on — the queue silently stopped advancing.
 *
 * Seat COUNTING was never affected: every availability query filters offers
 * by `claimExpiresAt > now` and holds by `holdUntil > now`, so lapsed ones
 * stop reserving inventory the moment they lapse. This sweep is about the
 * records agreeing with that, and about the next person actually getting
 * their turn.
 */

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;

/** One pass. Exported so a test can run it directly instead of waiting. */
export async function sweepOnce(): Promise<{ expired: number; reoffered: number }> {
  const expired = await expireStaleOffers();

  let reoffered = 0;
  if (expired > 0) {
    // Those seats are free again. Offer them to whoever is still waiting on
    // the events that had a lapsed offer — not every event in the database.
    const events = await prisma.waitlistEntry.findMany({
      where: { status: "WAITING" },
      select: { eventId: true },
      distinct: ["eventId"],
    });
    for (const { eventId } of events) {
      const result = await offerFreedSeats(eventId);
      reoffered += result.offered;
    }
  }

  // Stale PENDING orders hold nothing (availability ignores a lapsed
  // holdUntil), but leaving them PENDING forever makes the organiser's order
  // list unreadable and hides which carts were genuinely abandoned.
  const abandoned = await prisma.order.updateMany({
    where: { status: "PENDING", holdUntil: { lt: new Date() } },
    data: { status: "CANCELLED", holdUntil: null },
  });

  if (expired > 0 || reoffered > 0 || abandoned.count > 0) {
    logger.info({ expired, reoffered, abandoned: abandoned.count }, "sweep complete");
  }
  return { expired, reoffered };
}

export function startSweeper(intervalMs = Number(process.env.SWEEP_INTERVAL_MS ?? DEFAULT_INTERVAL_MS)): void {
  if (timer) return;

  const tick = async () => {
    // Skip rather than queue: a slow pass must not pile up behind itself.
    if (running) return;
    running = true;
    try {
      await sweepOnce();
    } catch (err) {
      // A failed sweep must never take the process down — the next tick retries.
      logger.warn({ err }, "sweep failed");
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  // Don't hold the event loop open: the process should still exit on SIGTERM.
  timer.unref();
  void tick();
  logger.info({ intervalMs }, "sweeper started");
}

export function stopSweeper(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
