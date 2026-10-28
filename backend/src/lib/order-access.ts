import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { prisma } from "./prisma.js";
import { HttpError } from "./http.js";
import { userHasPermission } from "../middleware/auth.js";

/**
 * Who may act on an order, and on the tickets inside it.
 *
 * Guest checkout means an order can have no customerId, and three route files
 * each answered that the same way:
 *
 *     const isGuestOrder = ticket.order.customerId === null;
 *     if (!isGuestOrder && ticket.order.customerId !== userId) throw 403;
 *
 * Read it closely and the guest branch does not check anything — it returns
 * the ticket to whoever asked. Anyone holding a guest ticket's id could cancel
 * it, rename its holder, exchange it, list it for resale or give it away.
 * "No account" had been implemented as "no check".
 *
 * The missing piece was never a user, it was proof. A guest has exactly one
 * thing a stranger does not: the link they were given at checkout. So that
 * link carries a secret — Order.accessToken — and it is the guest's
 * credential, playing the same role a session plays for a registered buyer.
 *
 * Three ways to be authorised, in the order they are checked:
 *   1. the order's access token (the buyer's link — works with no account);
 *   2. being the registered customer on the order;
 *   3. holding scope.any, i.e. staff acting on someone else's order.
 */

/** A fresh order credential. 24 bytes, base64url — same shape and generator
 * as TicketShare.token, which solved this problem first. */
export function newAccessToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * The token presented with this request, if any.
 *
 * Accepted from `?k=` (so it can live in the confirmation URL the buyer
 * bookmarks or forwards) or from an `X-Order-Token` header, which is what the
 * SPA sends once it has the value, to keep the secret out of referrer headers
 * and server logs on subsequent calls.
 */
export function presentedToken(req: Request): string | null {
  const q = req.query.k;
  if (typeof q === "string" && q.length > 0) return q;
  const h = req.get("x-order-token");
  if (h && h.length > 0) return h;
  return null;
}

/** Constant-time compare, so a wrong token cannot be narrowed down by timing
 * one character at a time. */
function tokenMatches(presented: string, stored: string | null): boolean {
  if (!stored) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(stored);
  // timingSafeEqual throws on a length mismatch, which is itself a leak of
  // length — but length is not the secret here, the value is, and an attacker
  // already knows how long our tokens are. Comparing hashes of equal length
  // would hide it, at the cost of making this harder to read for no real gain.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type OrderAuth = {
  /** True when the caller proved they are the buyer (token or ownership), as
   * opposed to staff looking at someone else's order. */
  isBuyer: boolean;
  /** True when the caller may see the buyer's own contact details. */
  maySeeContact: boolean;
};

/**
 * Authorise a request against one order. Throws 403 rather than 404: the
 * order's existence is not the secret, and a 404 here would let someone probe
 * which ids are real. Never throws 401 — the SPA signs the user out on a 401,
 * and a guest has no session to lose.
 */
export async function authoriseOrder(
  req: Request,
  order: { id: string; customerId: string | null; accessToken: string | null },
): Promise<OrderAuth> {
  const token = presentedToken(req);
  if (token && tokenMatches(token, order.accessToken)) {
    return { isBuyer: true, maySeeContact: true };
  }

  const userId = req.user?.id;
  if (userId && order.customerId && order.customerId === userId) {
    return { isBuyer: true, maySeeContact: true };
  }

  // Staff. scope.any is the capability that already means "act beyond your
  // own rows" everywhere else in this codebase, so it means that here too.
  if (await userHasPermission(req.user, "scope.any")) {
    return { isBuyer: false, maySeeContact: true };
  }

  throw new HttpError(403, "This order is not yours");
}

/**
 * The organiser of the event is allowed to see their own buyers — that is the
 * guest list. Checked separately from authoriseOrder because it needs the
 * event, and because an organiser is not the buyer.
 */
export async function authoriseOrderOrOrganiser(
  req: Request,
  order: { id: string; customerId: string | null; accessToken: string | null; eventId: string },
): Promise<OrderAuth> {
  try {
    return await authoriseOrder(req, order);
  } catch (err) {
    const userId = req.user?.id;
    if (!userId) throw err;
    const event = await prisma.event.findUnique({
      where: { id: order.eventId },
      select: { organiserId: true },
    });
    if (event?.organiserId === userId) return { isBuyer: false, maySeeContact: true };
    throw err;
  }
}

/**
 * Load a ticket and authorise the caller against the order it belongs to.
 * This is the single replacement for the three copies of requireOwnTicket.
 */
export async function requireTicketAccess(req: Request, ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { order: { include: { event: true } }, tier: true },
  });
  // A missing ticket is a genuine 404 — there is nothing to protect.
  if (!ticket) throw new HttpError(404, "Ticket not found");

  // A ticket received through a share link has its own token, because it sits
  // on the SENDER's order and the recipient must not be handed the key to the
  // rest of it. Checked first so the narrower credential is enough on its own.
  const presented = presentedToken(req);
  if (presented && ticket.accessToken && tokenMatches(presented, ticket.accessToken)) {
    return ticket;
  }

  await authoriseOrder(req, ticket.order);
  return ticket;
}
