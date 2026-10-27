import { randomBytes } from "node:crypto";
import { prisma } from "./prisma.js";
import { sendEmail } from "./email.js";
import { waitlistOfferHtml, waitlistOfferSubject } from "./email-templates.js";
import { logger } from "./logger.js";
import { committedForTier } from "./availability.js";

/**
 * Waitlist offers.
 *
 * When a seat frees up it is OFFERED to the next person in line and held for
 * them alone until the window closes. Emailing everyone at once would just
 * recreate the race this queue exists to remove — people click through and
 * find the seat gone.
 *
 * Nothing here throws: a waitlist is a courtesy layered on top of a refund or
 * a cancellation, and must never fail the operation that freed the seat.
 */

export const CLAIM_WINDOW_MINUTES = 30;

function claimExpiry(now = new Date()): Date {
  return new Date(now.getTime() + CLAIM_WINDOW_MINUTES * 60 * 1000);
}

/** Lapse offers whose window has closed, so their seat can move on. */
export async function expireStaleOffers(): Promise<number> {
  const result = await prisma.waitlistEntry.updateMany({
    where: { status: "OFFERED", claimExpiresAt: { lt: new Date() } },
    data: { status: "EXPIRED", claimToken: null, claimTierId: null, claimExpiresAt: null },
  });
  return result.count;
}

/**
 * Seats of a tier that nobody holds: capacity minus paid orders, live holds,
 * and offers already outstanding. An offer reserves a seat as firmly as a
 * checkout hold does — otherwise two people would be promised the same one.
 */
async function freeSeats(tierId: string): Promise<number> {
  const tier = await prisma.ticketTier.findUnique({ where: { id: tierId } });
  if (!tier) return 0;

  const committed = await committedForTier(tierId);

  const outstanding = await prisma.waitlistEntry.count({
    where: { claimTierId: tierId, status: "OFFERED", claimExpiresAt: { gt: new Date() } },
  });

  return Math.max(0, tier.capacity - committed - outstanding);
}

/**
 * Offer any free seats of an event to the people waiting, oldest first.
 *
 * Call this after anything that returns inventory: a refund, a cancellation,
 * a released hold, or an organiser raising capacity.
 */
export async function offerFreedSeats(eventId: string): Promise<{ offered: number }> {
  try {
    await expireStaleOffers();

    const event = await prisma.event.findUnique({ where: { id: eventId }, include: { tiers: true } });
    if (!event || event.status !== "PUBLISHED") return { offered: 0 };

    const waiting = await prisma.waitlistEntry.findMany({
      where: { eventId, status: "WAITING" },
      orderBy: { createdAt: "asc" },
    });
    if (waiting.length === 0) return { offered: 0 };

    let offered = 0;
    for (const tier of event.tiers) {
      let free = await freeSeats(tier.id);
      while (free > 0 && offered < waiting.length) {
        const entry = waiting[offered];
        const token = randomBytes(24).toString("base64url");

        // Guarded on WAITING so two concurrent calls (say a refund and a
        // released hold at once) can't offer the same person twice.
        const claimed = await prisma.waitlistEntry.updateMany({
          where: { id: entry.id, status: "WAITING" },
          data: {
            status: "OFFERED",
            claimToken: token,
            claimTierId: tier.id,
            claimExpiresAt: claimExpiry(),
            offeredAt: new Date(),
          },
        });
        if (claimed.count === 0) {
          offered += 1;
          continue;
        }

        void sendOfferEmail(entry.email, event.slug, event.titleFr, tier.nameFr, token).catch(() => {});
        offered += 1;
        free -= 1;
      }
    }

    if (offered > 0) logger.info({ eventId, offered }, "waitlist seats offered");
    return { offered };
  } catch (err) {
    logger.warn({ err, eventId }, "waitlist offer sweep failed");
    return { offered: 0 };
  }
}

async function sendOfferEmail(
  email: string,
  eventSlug: string,
  eventTitle: string,
  tierName: string,
  token: string,
): Promise<void> {
  const base = process.env.PUBLIC_APP_URL ?? "http://localhost:3100";
  const input = {
    locale: "fr" as const,
    eventTitle,
    tierName,
    minutes: CLAIM_WINDOW_MINUTES,
    claimUrl: `${base}/evenements/${eventSlug}?claim=${token}`,
  };
  await sendEmail({ to: email, subject: waitlistOfferSubject(input), html: waitlistOfferHtml(input) });
}

/** Resolve a claim token to a live offer, or null if it's unknown or lapsed. */
export async function resolveClaim(token: string) {
  const entry = await prisma.waitlistEntry.findUnique({
    where: { claimToken: token },
    include: { event: true },
  });
  if (!entry || entry.status !== "OFFERED") return null;
  if (!entry.claimExpiresAt || entry.claimExpiresAt.getTime() < Date.now()) return null;
  return entry;
}

/** Mark an offer as taken once its order is paid. */
export async function markClaimed(entryId: string): Promise<void> {
  await prisma.waitlistEntry.updateMany({
    where: { id: entryId, status: "OFFERED" },
    data: { status: "CLAIMED", claimedAt: new Date(), claimToken: null },
  });
}
