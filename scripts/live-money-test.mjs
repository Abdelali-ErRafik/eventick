/**
 * Live test — commission and payouts.
 *
 * Three things on the Finance screen used to be fiction: the organiser picked
 * their own plan from a row of buttons, `planCost()` ran in the browser and
 * stored nothing, and "Reversement" named a payout that did not exist.
 * Revenue was also the sum of PAID orders' totals, which counted refunded
 * money as earnings and charged commission on it.
 *
 * The properties under test are the ones money depends on:
 *
 *   - An organiser cannot set their own commission rate.
 *   - The fee is recorded ON THE ORDER when it settles, so changing a plan
 *     never rewrites what was already owed.
 *   - Revenue and commission both follow refunds down.
 *   - A payout needs bank details, cannot be run twice over the same orders,
 *     and cannot be marked paid twice or without a bank reference.
 *
 * Run from the backend directory, which has Prisma and the env:
 *   cd backend && npx tsx ../scripts/live-money-test.mjs
 */

import { prisma } from "../backend/src/lib/prisma.js";

const API = process.env.API_URL ?? "http://localhost:4100";
const ACCOUNTS = {
  admin: { email: "admin@eventick.ma", password: "eventick-admin-2026" },
  organiser: { email: "organisateur@eventick.ma", password: "eventick-orga-2026" },
};

let failures = 0;
function check(label, pass, detail) {
  if (!pass) failures++;
  console.log(`  ${pass ? "\x1b[32m PASS\x1b[0m" : "\x1b[31m FAIL\x1b[0m"}  ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
}
const mad = (cents) => (cents / 100).toFixed(2);

async function login({ email, password }) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.token) throw new Error(`login ${email}: ${JSON.stringify(data).slice(0, 150)}`);
  return data.token;
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 150);
  }
  return { status: res.status, data };
}

const SUFFIX = Date.now();

// The payout window the checks below use. Orders are created now, so the
// current month is the one that matters — and a tight window is what an admin
// would actually pick. A decade-wide period used to be fine here and became
// misleading once the plan subscription was billed per calendar month.
const now = new Date();
const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
const created = { events: [], orders: [] };

async function main() {
  const admin = await login(ACCOUNTS.admin);
  const orga = await login(ACCOUNTS.organiser);
  const orgaId = (await call("GET", "/api/auth/me", { token: orga })).data.user.id;

  // A throwaway event owned by the demo organiser, so the test never depends
  // on seeded revenue and never disturbs it.
  const start = new Date(Date.now() + 30 * 86_400_000);
  const event = await prisma.event.create({
    data: {
      slug: `money-test-${SUFFIX}`,
      organiserId: orgaId,
      titleFr: "Test finance",
      titleAr: "اختبار",
      category: "concert",
      city: "Casablanca",
      venueFr: "Salle",
      venueAr: "قاعة",
      address: "1 rue",
      startAt: start,
      endAt: start,
      doorsAt: start,
      image: "x.jpg",
      blurbFr: "b",
      blurbAr: "ب",
      aboutFr: "a",
      aboutAr: "أ",
      ageFr: "+18",
      ageAr: "+18",
      status: "PUBLISHED",
      tiers: {
        create: {
          nameFr: "Place",
          nameAr: "مقعد",
          blurbFr: "b",
          blurbAr: "ب",
          priceCents: 50000,
          capacity: 20,
          zoneFr: "Z",
          zoneAr: "ز",
          gateFr: "G",
          gateAr: "ج",
        },
      },
    },
    include: { tiers: true },
  });
  created.events.push(event.id);
  const tier = event.tiers[0];

  /** Buy `qty` seats and settle them (mock mode settles on /pay). */
  async function buy(qty) {
    const hold = await call("POST", "/api/orders/hold", {
      body: { eventSlug: event.slug, lines: [{ tierId: tier.id, qty }] },
    });
    const id = hold.data.order.id;
    created.orders.push(id);
    await call("POST", `/api/orders/${id}/pay?k=${encodeURIComponent(hold.data.accessToken)}`, {
      body: { holderName: "Money Test", email: `money-${SUFFIX}@eventick.ma`, phone: "0612345678" },
    });
    return id;
  }

  // ── Who may set a commission rate ───────────────────────────────────────
  console.log("\n\x1b[1mOnly an admin sets the plan\x1b[0m");
  {
    const self = await call("PATCH", `/api/platform/organisers/${orgaId}/plan`, {
      token: orga,
      body: { planKey: "business" },
    });
    // The whole point: an organiser choosing their own rate was the bug.
    check("an organiser cannot set their own plan", self.status === 403, `${self.status}`);

    const assigned = await call("PATCH", `/api/platform/organisers/${orgaId}/plan`, {
      token: admin,
      body: { planKey: "pro" },
    });
    check("an admin can assign a plan", assigned.status === 200 && assigned.data.plan === "pro", `${assigned.status} ${assigned.data.plan}`);

    const nonsense = await call("PATCH", `/api/platform/organisers/${orgaId}/plan`, {
      token: admin,
      body: { planKey: "free-lunch" },
    });
    check("an unknown plan is refused", nonsense.status === 400, `${nonsense.status}`);
  }

  // ── The fee is a fact about the sale, not a live calculation ────────────
  console.log("\n\x1b[1mCommission is recorded at settlement\x1b[0m");
  const orderId = await buy(2);
  {
    const row = await prisma.order.findUnique({
      where: { id: orderId },
      select: { totalCents: true, feeCents: true, feePlanKey: true, status: true },
    });
    // pro is 300 bps, so 3% of 1000.00 MAD.
    check("the order settled", row.status === "PAID", row.status);
    check("the fee is stored on the order", row.feeCents === 3000, `${row.feeCents} (expected 3000)`);
    check("the plan that produced it is stored too", row.feePlanKey === "pro", `${row.feePlanKey}`);

    /*
     * THE property that makes the figure trustworthy — asserted twice, and
     * deliberately so.
     *
     * Checking only the stored column passes even if the API ignores it and
     * recomputes the fee from today's plan on every read, which is the same
     * bug seen from the outside: the organiser watches their commission change
     * because someone edited a plan. So the reported figure is checked too,
     * through the route the Finance screen actually calls.
     */
    const reportedOnPro = (await call("GET", "/api/organiser/finance", { token: orga })).data.lifetime.feeCents;

    await call("PATCH", `/api/platform/organisers/${orgaId}/plan`, { token: admin, body: { planKey: "starter" } });
    const after = await prisma.order.findUnique({
      where: { id: orderId },
      select: { feeCents: true, feePlanKey: true },
    });
    check(
      "the stored fee is unchanged by a plan move",
      after.feeCents === 3000 && after.feePlanKey === "pro",
      `${after.feeCents} on ${after.feePlanKey} — starter would recompute to 5000`,
    );

    const reportedOnStarter = (await call("GET", "/api/organiser/finance", { token: orga })).data.lifetime.feeCents;
    // STABILITY is the property, not a particular total: the account may hold
    // other orders. Pinning an absolute figure here made the check fail for
    // the wrong reason once it did.
    check(
      "the REPORTED fee is unchanged too",
      reportedOnStarter === reportedOnPro,
      `pro reported ${mad(reportedOnPro)}, starter reported ${mad(reportedOnStarter)} — must match`,
    );

    await call("PATCH", `/api/platform/organisers/${orgaId}/plan`, { token: admin, body: { planKey: "pro" } });
  }

  // ── Refunds take their commission with them ─────────────────────────────
  console.log("\n\x1b[1mRefunds reduce revenue AND commission\x1b[0m");
  {
    const before = await call("GET", "/api/organiser/finance", { token: orga });
    const b = before.data.lifetime;

    const refund = await call("POST", `/api/organiser/orders/${orderId}/refund`, {
      token: orga,
      body: { amountCents: 50000 },
    });
    check("a partial refund is accepted", refund.status === 200, `${refund.status}`);

    const after = await call("GET", "/api/organiser/finance", { token: orga });
    const a = after.data.lifetime;
    check(
      "net revenue drops by the refund",
      a.netRevenueCents === b.netRevenueCents - 50000,
      `${mad(b.netRevenueCents)} -> ${mad(a.netRevenueCents)}`,
    );
    // Half the order was refunded, so half its 3000 fee goes with it. The old
    // screen kept charging the full fee on refunded money.
    check(
      "commission drops in proportion",
      a.feeCents === b.feeCents - 1500,
      `${mad(b.feeCents)} -> ${mad(a.feeCents)}`,
    );
  }

  // ── Bank details gate the payout ────────────────────────────────────────
  console.log("\n\x1b[1mA payout needs somewhere to send it\x1b[0m");
  {
    await prisma.bankAccount.deleteMany({ where: { organiserId: orgaId } });
    const noBank = await call("POST", `/api/platform/organisers/${orgaId}/payouts`, {
      token: admin,
      body: { periodStart: thisMonthStart, periodEnd: tomorrow },
    });
    // A PENDING payout nobody can send is worse than none: it reads as money
    // already on its way.
    check("a payout without bank details is refused", noBank.status === 409, `${noBank.status}`);

    const shortRib = await call("PUT", "/api/organiser/bank-account", {
      token: orga,
      body: { holderName: "Yasmine Organisatrice", rib: "123" },
    });
    check("a RIB that is not 24 digits is refused", shortRib.status === 400, `${shortRib.status}`);

    const saved = await call("PUT", "/api/organiser/bank-account", {
      token: orga,
      body: { holderName: "Yasmine Organisatrice", rib: "1234 5678 9012 3456 7890 1234", bank: "CIH" },
    });
    check("spacing in a pasted RIB is tolerated", saved.status === 200, `${saved.status}`);
    check("only the last four digits come back", saved.data.ribLast4 === "1234" && !("rib" in saved.data), JSON.stringify(saved.data));
  }

  // ── The run itself ──────────────────────────────────────────────────────
  console.log("\n\x1b[1mRunning a payout\x1b[0m");
  let payoutId;
  {
    const earnings = await call("GET", `/api/platform/organisers/${orgaId}/earnings`, { token: admin });
    const owed = earnings.data.pending.payableCents;

    const run = await call("POST", `/api/platform/organisers/${orgaId}/payouts`, {
      token: admin,
      body: { periodStart: thisMonthStart, periodEnd: tomorrow },
    });
    check("the payout is created", run.status === 201, `${run.status} ${run.data.error ?? ""}`);
    // Ticket revenue minus commission, LESS the plan subscription for the
    // month. `owed` is the pre-subscription figure, so the difference between
    // them must be exactly what was billed — not zero.
    check(
      "it transfers what was owed, less the subscription",
      run.data.netCents === owed - run.data.subscriptionCents,
      `${mad(run.data.netCents)} = ${mad(owed)} - ${mad(run.data.subscriptionCents)}`,
    );
    payoutId = run.data.payoutId;

    // The safeguard that matters: an order belongs to one payout, ever.
    const again = await call("POST", `/api/platform/organisers/${orgaId}/payouts`, {
      token: admin,
      body: { periodStart: thisMonthStart, periodEnd: tomorrow },
    });
    check("re-running the same period pays nothing twice", again.status === 409, `${again.status}`);

    const backwards = await call("POST", `/api/platform/organisers/${orgaId}/payouts`, {
      token: admin,
      body: { periodStart: tomorrow, periodEnd: thisMonthStart },
    });
    check("an inverted period is refused", backwards.status === 400, `${backwards.status}`);
  }

  // ── Marking it sent ─────────────────────────────────────────────────────
  console.log("\n\x1b[1mMarking a payout paid\x1b[0m");
  {
    const noRef = await call("POST", `/api/platform/payouts/${payoutId}/paid`, { token: admin, body: { reference: "" } });
    // Without a reference the row cannot be reconciled against a statement,
    // which is the only reason it exists.
    check("a bank reference is required", noRef.status === 400, `${noRef.status}`);

    const paid = await call("POST", `/api/platform/payouts/${payoutId}/paid`, {
      token: admin,
      body: { reference: `VIR-${SUFFIX}` },
    });
    check("it can be marked paid", paid.status === 200, `${paid.status}`);

    const twice = await call("POST", `/api/platform/payouts/${payoutId}/paid`, {
      token: admin,
      body: { reference: "VIR-OTHER" },
    });
    check("marking it paid twice is refused", twice.status === 409, `${twice.status}`);

    const cancelSent = await call("POST", `/api/platform/payouts/${payoutId}/cancel`, { token: admin, body: {} });
    // A transfer that has gone cannot be un-sent by editing a row.
    check("a sent payout cannot be cancelled", cancelSent.status === 409, `${cancelSent.status}`);

    const frozen = await prisma.payout.findUnique({
      where: { id: payoutId },
      select: { reference: true, netCents: true, paidAt: true },
    });
    check("the real reference survived the second attempt", frozen.reference === `VIR-${SUFFIX}`, frozen.reference);
    check("paidAt is stamped", frozen.paidAt !== null);

    // Totals are copied at creation, so later refunds cannot change what was
    // already paid.
    await call("POST", `/api/organiser/orders/${orderId}/refund`, { token: orga, body: { amountCents: 10000 } });
    const after = await prisma.payout.findUnique({ where: { id: payoutId }, select: { netCents: true } });
    check(
      "a later refund does not change a completed payout",
      after.netCents === frozen.netCents,
      `${mad(frozen.netCents)} -> ${mad(after.netCents)}`,
    );
  }

  // ── Who can see what ────────────────────────────────────────────────────
  console.log("\n\x1b[1mVisibility\x1b[0m");
  {
    const own = await call("GET", "/api/organiser/payouts", { token: orga });
    check("an organiser sees their own payouts", own.status === 200 && own.data.payouts.length > 0, `${own.status} n=${own.data.payouts?.length}`);

    const platform = await call("GET", "/api/platform/payouts", { token: orga });
    check("an organiser cannot list every payout", platform.status === 403, `${platform.status}`);

    const adminList = await call("GET", "/api/platform/payouts", { token: admin });
    const row = adminList.data.payouts?.find((p) => p.id === payoutId);
    // Whoever actions the transfer needs the full RIB; this route is already
    // behind scope.any + finance.view.
    check("an admin sees the RIB to pay from", row?.bank?.rib === "123456789012345678901234", row?.bank?.rib);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────
  console.log("\n\x1b[1mCleanup\x1b[0m");
  await prisma.payoutOrder.deleteMany({ where: { payout: { organiserId: orgaId } } });
  await prisma.payout.deleteMany({ where: { organiserId: orgaId } });
  await prisma.bankAccount.deleteMany({ where: { organiserId: orgaId } });
  await prisma.user.update({ where: { id: orgaId }, data: { planId: null } });
  for (const eventId of created.events) {
    const tiers = await prisma.ticketTier.findMany({ where: { eventId }, select: { id: true } });
    const tierIds = tiers.map((t) => t.id);
    await prisma.ticket.deleteMany({ where: { tierId: { in: tierIds } } });
    await prisma.orderLine.deleteMany({ where: { tierId: { in: tierIds } } });
    await prisma.order.deleteMany({ where: { eventId } });
    await prisma.ticketTier.deleteMany({ where: { eventId } });
    await prisma.event.delete({ where: { id: eventId } });
  }
  const left = await prisma.event.count({ where: { slug: `money-test-${SUFFIX}` } });
  check("test data removed", left === 0, `${left} event(s) left`);

  console.log(
    failures === 0 ? "\n\x1b[32mAll money checks passed\x1b[0m" : `\n\x1b[31m${failures} FAILED\x1b[0m`,
  );
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\x1b[31mharness error:\x1b[0m", err);
  await prisma.$disconnect();
  process.exit(1);
});
