import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/http.js";
import { authenticate, requirePermission } from "../middleware/auth.js";

/**
 * The platform console — what someone running the marketplace needs, as
 * opposed to what an organiser needs.
 *
 * An admin's /pro dashboard was an ORGANISER dashboard with bigger numbers:
 * the same four tiles (encaissé, billets, entrées), summed across everyone
 * because scope.any widens the query. That answers "how are my events
 * doing", which an admin does not have. It does not answer how many
 * organisers exist, whether anyone is waiting for approval, how many of
 * them have never sold anything, or whether refunds are climbing.
 *
 * Gated on scope.any AND finance.view, not users.manage: this is money
 * across every organiser on the platform, so the two capabilities it
 * actually needs are "may act beyond your own rows" and "may see revenue".
 * users.manage is about editing accounts, which is a different question.
 */

export const platformRouter = Router();

platformRouter.use(authenticate, requirePermission("scope.any"), requirePermission("finance.view"));

/** Start of the UTC day, `days` ago. */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

platformRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const weekAgo = daysAgo(7);
    const prevWeek = daysAgo(14);

    const [
      usersByRole,
      ordersByStatus,
      eventsByStatus,
      ticketsByStatus,
      paidTotals,
      refundTotals,
      pendingApplications,
      newUsersThisWeek,
      paidThisWeek,
      paidPrevWeek,
    ] = await Promise.all([
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.event.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
      // Gross counts PAID and REFUNDED alike: a refunded order was still a
      // sale that happened. Netting them into one figure would hide the
      // refund rate, which is the number worth watching.
      prisma.order.aggregate({
        where: { status: { in: ["PAID", "REFUNDED"] } },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
      prisma.order.aggregate({ _sum: { refundedCents: true } }),
      prisma.organiserApplication.count({ where: { status: "PENDING" } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.order.aggregate({
        where: { status: { in: ["PAID", "REFUNDED"] }, createdAt: { gte: weekAgo } },
        _sum: { totalCents: true },
      }),
      prisma.order.aggregate({
        where: { status: { in: ["PAID", "REFUNDED"] }, createdAt: { gte: prevWeek, lt: weekAgo } },
        _sum: { totalCents: true },
      }),
    ]);

    const countOf = <T extends string>(rows: Array<{ _count: { _all: number } }>, key: T, field: string) =>
      rows.find((r) => (r as unknown as Record<string, unknown>)[field] === key)?._count._all ?? 0;

    const grossCents = paidTotals._sum.totalCents ?? 0;
    const refundedCents = refundTotals._sum.refundedCents ?? 0;
    const thisWeekCents = paidThisWeek._sum.totalCents ?? 0;
    const prevWeekCents = paidPrevWeek._sum.totalCents ?? 0;

    res.json({
      users: {
        total: usersByRole.reduce((sum, r) => sum + r._count._all, 0),
        customers: countOf(usersByRole, "CUSTOMER", "role"),
        organisers: countOf(usersByRole, "ORGANISER", "role"),
        admins: countOf(usersByRole, "ADMIN", "role"),
        newThisWeek: newUsersThisWeek,
      },
      /** Waiting on an admin. The one number that is a to-do, not a metric. */
      pendingApplications,
      events: {
        published: countOf(eventsByStatus, "PUBLISHED", "status"),
        hidden: countOf(eventsByStatus, "HIDDEN", "status"),
        draft: countOf(eventsByStatus, "DRAFT", "status"),
        cancelled: countOf(eventsByStatus, "CANCELLED", "status"),
      },
      orders: {
        paid: countOf(ordersByStatus, "PAID", "status"),
        refunded: countOf(ordersByStatus, "REFUNDED", "status"),
        cancelled: countOf(ordersByStatus, "CANCELLED", "status"),
        pending: countOf(ordersByStatus, "PENDING", "status"),
      },
      tickets: {
        valid: countOf(ticketsByStatus, "VALID", "status"),
        used: countOf(ticketsByStatus, "USED", "status"),
        cancelled: countOf(ticketsByStatus, "CANCELLED", "status"),
        transferred: countOf(ticketsByStatus, "TRANSFERRED", "status"),
      },
      revenue: {
        grossCents,
        refundedCents,
        netCents: grossCents - refundedCents,
        /** Share of gross handed back, in basis points to stay integer. */
        refundRateBp: grossCents > 0 ? Math.round((refundedCents / grossCents) * 10_000) : 0,
        thisWeekCents,
        prevWeekCents,
      },
      generatedAt: new Date().toISOString(),
    });
  }),
);

/**
 * Everyone who runs events, ranked by what they have actually sold.
 *
 * The number that matters to a marketplace is not how many organisers
 * signed up but how many are selling — so this includes the ones with zero,
 * rather than filtering them out and hiding the problem.
 *
 * Selected by "holds the role OR owns events", not by role alone. The first
 * version filtered on role: "ORGANISER" and reported 3 events while the
 * platform had 17 — the other 14 belong to the admin account, which runs
 * house events and is invisible to a role filter. Anyone selling belongs on
 * a page about who is selling, whatever their role says.
 */
platformRouter.get(
  "/organisers",
  asyncHandler(async (_req, res) => {
    const organisers = await prisma.user.findMany({
      where: { OR: [{ role: "ORGANISER" }, { events: { some: {} } }] },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        events: { select: { id: true } },
      },
    });

    const rows = await Promise.all(
      organisers.map(async (organiser) => {
        const eventIds = organiser.events.map((e) => e.id);
        const totals =
          eventIds.length === 0
            ? { _sum: { totalCents: null }, _count: { _all: 0 } }
            : await prisma.order.aggregate({
                where: { eventId: { in: eventIds }, status: { in: ["PAID", "REFUNDED"] } },
                _sum: { totalCents: true },
                _count: { _all: true },
              });

        return {
          id: organiser.id,
          name: organiser.name,
          email: organiser.email,
          // Surfaced because an ADMIN can appear here, and "why is the admin
          // on the organiser leaderboard" is a fair question the row should
          // answer itself.
          role: organiser.role,
          joinedAt: organiser.createdAt.toISOString(),
          events: eventIds.length,
          orders: totals._count._all,
          grossCents: totals._sum.totalCents ?? 0,
        };
      }),
    );

    rows.sort((a, b) => b.grossCents - a.grossCents || b.events - a.events);
    res.json({ organisers: rows });
  }),
);
