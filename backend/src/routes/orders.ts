import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, param } from "../lib/http.js";
import { optionalAuth, authenticate } from "../middleware/auth.js";
import { checkBuyerLimit, checkQuantity, holdExpiry, salesState, tierRemaining } from "../domain/inventory.js";
import { quotePromo, type PromoCandidate } from "../domain/pricing.js";
import { phoneOk, makePaymentRef } from "../lib/payment-sim.js";
import { publicOrder, publicOrderWithContext } from "../lib/serialize.js";
import { remainingByTier } from "../lib/availability.js";
import { buildOid, buildPaymentRequest, cmiConfig, cmiUrls, isMockPayments } from "../lib/cmi.js";
import { settleOrder } from "../lib/settle.js";
import { withSerializableRetry } from "../lib/serializable.js";
import { markClaimed, offerFreedSeats, resolveClaim } from "../lib/waitlist.js";
import { authoriseOrder, authoriseOrderOrOrganiser, newAccessToken } from "../lib/order-access.js";

export const ordersRouter = Router();

const holdSchema = z.object({
  eventSlug: z.string(),
  lines: z.array(z.object({ tierId: z.string(), qty: z.number().int().min(1) })).min(1),
  // Buyer details are OPTIONAL here and required at /pay. The seat is claimed
  // the moment someone presses Book, before they type anything — otherwise a
  // buyer fills in a whole form and only then learns the tickets went to
  // someone else, which is the one outcome this flow exists to prevent.
  holderName: z.string().min(3).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  promoCode: z.string().optional(),
  /** Waitlist claim token. The seat it names is reserved for this person, so
   * it is counted as available to them even when the tier reads sold out. */
  claimToken: z.string().optional(),
});

/**
 * Step 1 — reserve. Creates a PENDING order holding its seats until
 * `holdUntil`, inside a transaction that re-counts committed stock at write
 * time so two buyers can't both claim the last seat.
 *
 * This replaces the old one-shot /checkout, which took a raw card number over
 * the wire and marked the order PAID in the same request. No card data reaches
 * this API any more: step 2 sends the buyer to CMI's own card page.
 */
ordersRouter.post(
  "/hold",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = holdSchema.parse(req.body);
    if (body.phone && !phoneOk(body.phone)) throw new HttpError(400, "Invalid phone number");

    const event = await prisma.event.findUnique({ where: { slug: body.eventSlug } });
    if (!event || event.status !== "PUBLISHED") throw new HttpError(404, "Event not found");

    // A waitlist offer reserves one seat of one tier for this person. It is
    // excluded from the committed count below, so they can take the seat the
    // offer promised even though the tier reads sold out to everyone else.
    const claim = body.claimToken ? await resolveClaim(body.claimToken) : null;
    if (body.claimToken && !claim) throw new HttpError(410, "This offer has expired or is no longer valid");
    if (claim && claim.eventId !== event.id) throw new HttpError(400, "This offer is for a different event");

    const order = await withSerializableRetry(async (tx) => {
      const tiers = await tx.ticketTier.findMany({
        where: { id: { in: body.lines.map((line) => line.tierId) }, eventId: event.id },
      });
      if (tiers.length !== body.lines.length) throw new HttpError(400, "Invalid ticket tier");

      /*
       * Is each tier on sale right now?
       *
       * Checked here, inside the transaction, rather than only hidden in the
       * UI: a tier that is not yet open or has closed must refuse a hold even
       * if someone reaches the API directly or keeps a stale page open across
       * the boundary. "not yet" and "closed" get different words because one
       * invites the buyer back and the other does not.
       */
      for (const tier of tiers) {
        const state = salesState(tier);
        if (!state.open) {
          throw new HttpError(
            409,
            state.reason === "not_yet"
              ? `Sales for this zone open on ${state.at.toISOString()}`
              : "Sales for this zone have closed",
          );
        }
      }

      /*
       * Has this buyer already taken their share of the event?
       *
       * The per-tier cap above limits ONE request to 8. This limits a PERSON
       * across every order they place — without it, one email could place
       * three 8-seat orders and take 24 seats of a high-demand show, which
       * was verified against the running app before this existed.
       *
       * Identity here is the email for a guest and the account for a signed-in
       * buyer. Neither is proof of a person, and a determined scalper can use
       * more addresses — but the limit that stops the casual case is worth far
       * more than no limit at all, and anything stronger means asking every
       * buyer for ID.
       */
      if (event.maxPerBuyer > 0) {
        const identity = req.user?.id
          ? { customerId: req.user.id }
          : body.email
            // Case-INSENSITIVE, because orders store the address as the buyer
            // typed it. Matching exactly would let Case@x.ma and case@x.ma
            // count as two different people and walk straight through the
            // limit this check exists to enforce.
            ? { email: { equals: body.email.trim(), mode: "insensitive" as const } }
            : null;

        if (identity) {
          const held = await tx.ticket.count({
            where: {
              status: { in: ["VALID", "USED"] },
              order: { eventId: event.id, ...identity },
            },
          });
          // Live holds count too, or two concurrent checkouts each pass.
          const holding = await tx.orderLine.aggregate({
            where: {
              order: {
                eventId: event.id,
                status: "PENDING",
                holdUntil: { gt: new Date() },
                ...identity,
              },
            },
            _sum: { qty: true },
          });
          const wanted = body.lines.reduce((sum, line) => sum + line.qty, 0);
          const limit = checkBuyerLimit(held + (holding._sum.qty ?? 0), wanted, event.maxPerBuyer);
          if (!limit.ok) throw new HttpError(409, limit.reason ?? "Purchase limit reached");
        }
      }

      // Count ISSUED TICKETS, not paid orders. A resold seat leaves the
      // seller's order REFUNDED while the buyer's ticket lives on — counting
      // orders would hand that seat out a second time. Must stay in step with
      // lib/availability.ts, which answers the same question for display.
      const issued = await tx.ticket.groupBy({
        by: ["tierId"],
        where: { tierId: { in: tiers.map((tier) => tier.id) }, status: { in: ["VALID", "USED"] } },
        _count: { _all: true },
      });
      const committed = new Map<string, number>();
      for (const row of issued) {
        committed.set(row.tierId, row._count._all);
      }

      // Live holds that haven't produced tickets yet.
      const pendingLines = await tx.orderLine.findMany({
        where: {
          tierId: { in: tiers.map((tier) => tier.id) },
          order: { status: "PENDING", holdUntil: { gt: new Date() } },
        },
      });
      for (const line of pendingLines) {
        committed.set(line.tierId, (committed.get(line.tierId) ?? 0) + line.qty);
      }

      // Outstanding waitlist offers reserve seats too — without this a
      // walk-up buyer could take the seat already promised to someone in the
      // queue, and the offer email would lead to a sold-out page.
      const offers = await tx.waitlistEntry.groupBy({
        by: ["claimTierId"],
        where: {
          claimTierId: { in: tiers.map((tier) => tier.id) },
          status: "OFFERED",
          claimExpiresAt: { gt: new Date() },
        },
        _count: { _all: true },
      });
      for (const offer of offers) {
        if (!offer.claimTierId) continue;
        committed.set(offer.claimTierId, (committed.get(offer.claimTierId) ?? 0) + offer._count._all);
      }

      let subtotalCents = 0;
      for (const line of body.lines) {
        const tier = tiers.find((item) => item.id === line.tierId)!;
        // The claimed seat is already counted in `committed` as part of the
        // outstanding offer; credit it back so its owner can actually take it.
        const reserved = claim?.claimTierId === tier.id ? 1 : 0;
        const remaining = tierRemaining(tier.capacity, (committed.get(tier.id) ?? 0) - reserved);
        const check = checkQuantity(line.qty, remaining);
        if (!check.ok) throw new HttpError(409, check.reason ?? "Oversold");
        subtotalCents += tier.priceCents * line.qty;
      }

      let discountCents = 0;
      let appliedPromo: PromoCandidate | null = null;
      if (body.promoCode?.trim()) {
        const candidates: PromoCandidate[] = (
          await tx.promoCode.findMany({ where: { OR: [{ eventId: event.id }, { eventId: null }] } })
        ).map((promo) => ({
          id: promo.id,
          code: promo.code,
          kind: promo.kind,
          value: promo.value,
          eventId: promo.eventId,
          maxUses: promo.maxUses,
          uses: promo.uses,
        }));
        const quote = quotePromo(candidates, body.promoCode, event.id, subtotalCents);
        if (!quote) throw new HttpError(400, "Invalid or expired promo code");
        discountCents = quote.discountCents;
        appliedPromo = quote.promo;
      }

      const created = await tx.order.create({
        data: {
          customerId: req.user?.id ?? null,
          eventId: event.id,
          status: "PENDING",
          // Blank until /pay collects them — the reservation is what matters
          // at this point, not who it belongs to.
          holderName: body.holderName ?? "",
          email: body.email ?? "",
          phone: body.phone ?? "",
          subtotalCents,
          discountCents,
          totalCents: subtotalCents - discountCents,
          promoCodeId: appliedPromo?.id ?? null,
          holdUntil: holdExpiry(),
          // The buyer's credential, issued here because this is where the
          // order comes into being. A guest has no session, so this token is
          // the only thing that will distinguish them from a stranger who
          // happens to learn the order id.
          accessToken: newAccessToken(),
        },
      });

      for (const line of body.lines) {
        await tx.orderLine.create({ data: { orderId: created.id, tierId: line.tierId, qty: line.qty } });
      }

      return tx.order.findUniqueOrThrow({ where: { id: created.id }, include: { tickets: true } });
    });

    res.status(201).json({
      order: publicOrder(order),
      // The ONE response that carries the token: this is the buyer, at the
      // moment they created the order. Everywhere else it is deliberately
      // withheld, so that reading an order can never hand over the
      // credential for changing it.
      accessToken: order.accessToken,
      holdUntil: order.holdUntil?.toISOString() ?? null,
      claimEntryId: claim?.id ?? null,
    });
  }),
);

/** Release a hold the buyer abandoned, returning its seats immediately
 * instead of waiting for the hold to lapse. */
ordersRouter.delete(
  "/hold/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) throw new HttpError(404, "Order not found");
    // Releasing someone else's hold would hand their seats to whoever is
    // waiting — cheap to do, and invisible to the buyer until they try to pay.
    await authoriseOrder(req, order);
    if (order.status !== "PENDING") throw new HttpError(409, "Order is no longer pending");
    await prisma.order.update({ where: { id }, data: { status: "CANCELLED", holdUntil: null } });
    // An abandoned cart returns seats — offer them to whoever is waiting.
    void offerFreedSeats(order.eventId);
    res.status(204).end();
  }),
);

const paySchema = z.object({
  holderName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  /** Waitlist entry this order came from, so paying it closes the offer. */
  claimEntryId: z.string().optional(),
  /** Which language CMI should render its hosted card page in. */
  locale: z.enum(["fr", "en", "ar"]).optional(),
});

/**
 * Step 2 — pay. Returns a signed form that sends the browser to CMI's hosted
 * 3-D Secure page, where the card is collected. The number never touches this
 * server, and the hash stops a buyer editing the amount on the way.
 *
 * Nothing here marks the order paid: that happens only when CMI calls our
 * webhook back (routes/webhooks.ts), because the browser cannot be trusted to
 * report its own payment and may never return at all.
 *
 * In mock mode (no CMI_CLIENT_ID) there is no gateway, so the order is settled
 * on the spot and the response says so.
 */
ordersRouter.post(
  "/:id/pay",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const body = paySchema.parse(req.body ?? {});
    const order = await prisma.order.findUnique({ where: { id }, include: { event: true } });
    if (!order) throw new HttpError(404, "Order not found");
    // Paying is a write: it attaches a name, email and phone to the order and
    // then issues tickets in that name. Without this, a stranger could put
    // their own details on someone else's held order.
    await authoriseOrder(req, order);
    if (order.status === "PAID") throw new HttpError(409, "Order is already paid");
    if (order.status !== "PENDING") throw new HttpError(409, "Order is no longer payable");
    if (order.holdUntil && order.holdUntil.getTime() < Date.now()) {
      throw new HttpError(410, "Hold expired — please start again");
    }

    // Buyer details arrive here, not at hold time. Required before money
    // moves: a ticket with no name or address can't be delivered or checked.
    const holderName = body.holderName ?? order.holderName;
    const email = body.email ?? order.email;
    const phone = body.phone ?? order.phone;
    if (holderName.trim().length < 3) throw new HttpError(400, "Buyer name is required");
    if (!email.includes("@")) throw new HttpError(400, "A valid email is required");
    if (!phoneOk(phone)) throw new HttpError(400, "Invalid phone number");

    if (holderName !== order.holderName || email !== order.email || phone !== order.phone) {
      await prisma.order.update({ where: { id: order.id }, data: { holderName, email, phone } });
      order.holderName = holderName;
      order.email = email;
      order.phone = phone;
    }

    if (isMockPayments()) {
      const result = await settleOrder(order.id, { paymentRef: makePaymentRef(), cardBank: "Démo" });
      if (!result.settled) throw new HttpError(409, "Order could not be settled");
      if (body.claimEntryId) await markClaimed(body.claimEntryId);
      return res.json({ mode: "mock", settled: true });
    }

    // The waitlist offer closes now rather than after the callback: the
    // callback has no way to know which entry this order came from, and the
    // offer must not stay claimable while the buyer is at the gateway.
    if (body.claimEntryId) await markClaimed(body.claimEntryId);

    const config = cmiConfig()!;
    const urls = cmiUrls(order.id, order.accessToken);

    /*
     * Each trip to the gateway is its own CMI transaction.
     *
     * CMI refuses a second attempt on the same oid — "There is an ongoing
     * transaction related to the order. (99)" — so reusing the bare order id
     * meant a buyer whose card was declined could never retry. Bumping a
     * counter gives CMI a fresh transaction while the order stays the one
     * thing being paid for.
     */
    const attempt = await prisma.order.update({
      where: { id: order.id },
      data: { payAttempts: { increment: 1 } },
      select: { payAttempts: true },
    });

    const request = buildPaymentRequest(
      {
        // `<orderId>-<attempt>`; the callback strips the suffix to find the
        // order again.
        reference: buildOid(order.id, attempt.payAttempts),
        totalCents: order.totalCents,
        email: order.email,
        holderName: order.holderName,
        phone: order.phone,
        locale: body.locale,
        ...urls,
      },
      config,
    );

    res.json({ mode: "cmi", action: request.action, fields: request.fields });
  }),
);

ordersRouter.get(
  "/:id",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const order = await prisma.order.findUnique({
      where: { id },
      include: { tickets: { include: { tier: { include: { event: true } } } } },
    });
    if (!order) throw new HttpError(404, "Order not found");

    // Was open to anyone holding the id, which exposed the buyer's name,
    // email and phone. The organiser is allowed too: these are their own
    // buyers, and they already see them on the guest list.
    const auth = await authoriseOrderOrOrganiser(req, order);

    res.json({ order: publicOrderWithContext(order, { contact: auth.maySeeContact }) });
  }),
);

ordersRouter.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { customerId: req.user!.id },
      include: { tickets: { include: { tier: { include: { event: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ orders: orders.map((o) => publicOrderWithContext(o)) });
  }),
);

/**
 * Attach a guest order to the account that is signed in.
 *
 * Without this, "create an account to manage this ticket" would be a dead
 * end: /register makes an account but nothing links the orders bought before
 * it existed, and GET /orders filters on customerId — so a guest who signed
 * up would still see an empty ticket list and still be refused the actions
 * that now need a session.
 *
 * Authorised by the order's own access token, which is the thing the buyer
 * demonstrably has (it is in their confirmation link). Deliberately NOT by
 * matching the order's email: that email is shown to anyone holding the same
 * link, so it would be a password printed on the door.
 *
 * Idempotent for the same account, so a double-click or a retry is harmless.
 * An order already claimed by SOMEONE ELSE is refused rather than reassigned
 * — two people can hold the same link, and the first to claim it is the one
 * whose account the refund will later go to.
 */
ordersRouter.post(
  "/:id/claim",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = param(req, "id");
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) throw new HttpError(404, "Order not found");

    // Proves the caller holds the buyer's link. authoriseOrder also accepts
    // an existing owner's session, which is what makes a repeat call a no-op.
    await authoriseOrder(req, order);

    const userId = req.user!.id;
    if (order.customerId && order.customerId !== userId) {
      throw new HttpError(409, "This order already belongs to another account");
    }

    const updated = order.customerId
      ? order
      : await prisma.order.update({ where: { id }, data: { customerId: userId } });

    res.json({ order: publicOrder({ ...updated, tickets: [] }), claimed: !order.customerId });
  }),
);

// Exposed for the event-detail screen's live "n seats left" display.
ordersRouter.get(
  "/availability/:slug",
  asyncHandler(async (req, res) => {
    const slug = param(req, "slug");
    const event = await prisma.event.findUnique({ where: { slug } });
    if (!event) throw new HttpError(404, "Event not found");
    res.json({ remaining: await remainingByTier(event.id) });
  }),
);
