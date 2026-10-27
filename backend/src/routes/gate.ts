import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { resolveScan } from "../lib/ticket-signature.js";
import { emitToOrganiser } from "../lib/realtime.js";

export const gateRouter = Router();

gateRouter.use(authenticate, requireRole("ORGANISER", "ADMIN"));

const checkInSchema = z.object({
  ref: z.string().min(3),
  /** Where the code came from. A camera scan must carry a valid signature;
   * a typed ref is a deliberate staff override. Defaults to the strict case
   * so an older client can never weaken the rule by omitting it. */
  source: z.enum(["camera", "manual"]).default("camera"),
});

/**
 * Check-in. `ref` is either a scanned QR payload (signed) or a hand-typed
 * reference — the fallback matters when a phone screen won't scan.
 *
 * The admission is a single guarded UPDATE rather than read-then-write: two
 * doors scanning the same ticket at the same instant previously both passed
 * the status check and both admitted. Now exactly one update matches
 * `status: VALID`, and the loser is told the ticket is already used.
 */
gateRouter.post(
  "/check-in",
  asyncHandler(async (req, res) => {
    const body = checkInSchema.parse(req.body);

    const scan = resolveScan(body.ref, body.source);
    // Refuse before querying, so a forged code never becomes a database probe.
    if (!scan.ok) {
      // An unsigned code from a camera is a forgery attempt, not a typo —
      // say so distinctly rather than hiding it behind "invalid".
      const message =
        scan.reason === "unsigned"
          ? "Unsigned QR code — scan the ticket's own code, or enter the reference manually"
          : "Invalid ticket code";
      throw new HttpError(400, message);
    }

    const claimed = await prisma.ticket.updateMany({
      where: { ref: scan.ref, status: "VALID" },
      data: { status: "USED", usedAt: new Date() },
    });

    if (claimed.count === 1) {
      const ticket = await prisma.ticket.findUniqueOrThrow({
        where: { ref: scan.ref },
        include: { order: { include: { event: true } } },
      });
      // Push to the organiser's dashboard so the entry counter moves without
      // a reload, on whatever screen they have open.
      emitToOrganiser(ticket.order.event.organiserId, {
        type: "checkin",
        eventSlug: ticket.order.event.slug,
        ref: ticket.ref,
        holderName: ticket.holderName,
        at: new Date().toISOString(),
      });
      res.json({
        result: "ok",
        signed: scan.signed,
        ticket: { ref: ticket.ref, holderName: ticket.holderName, usedAt: ticket.usedAt },
      });
      return;
    }

    // Nothing was claimed: either the ticket does not exist, or it was not
    // VALID. Read it to say which.
    const ticket = await prisma.ticket.findUnique({ where: { ref: scan.ref } });
    if (!ticket) throw new HttpError(404, "Ticket not found");

    if (ticket.status === "USED") {
      res.status(409).json({ result: "used", ticket: { ref: ticket.ref, usedAt: ticket.usedAt } });
      return;
    }
    if (ticket.status === "CANCELLED") {
      res.status(409).json({ result: "cancelled", ticket: { ref: ticket.ref } });
      return;
    }
    res.status(409).json({ result: "moved", ticket: { ref: ticket.ref, holderName: ticket.holderName } });
  }),
);

/**
 * Offline manifest: every valid ticket reference for one event, so a gate
 * device can keep admitting when the network dies mid-event.
 *
 * Plain refs, not hashes: the device has to compare what it scanned against
 * this list, and it cannot compute a keyed hash without the server secret.
 * Scoped to one event, and these refs are already printed on every attendee's
 * ticket — so a lost phone leaks little that isn't already in circulation.
 * The signature check still runs on every scan, online or off.
 */
gateRouter.get(
  "/events/:slug/manifest",
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await prisma.event.findUnique({ where: { slug } });
    if (!event) throw new HttpError(404, "Event not found");
    if (event.organiserId !== req.user!.id && req.user!.role !== "ADMIN") {
      throw new HttpError(403, "Not your event");
    }

    const tickets = await prisma.ticket.findMany({
      where: { order: { eventId: event.id, status: "PAID" } },
      select: { ref: true, status: true },
    });

    res.json({
      eventSlug: event.slug,
      generatedAt: new Date().toISOString(),
      // Only VALID tickets admit offline. A USED or CANCELLED one is absent,
      // so the device refuses it rather than trusting a stale snapshot.
      refs: tickets.filter((t) => t.status === "VALID").map((t) => t.ref),
    });
  }),
);
