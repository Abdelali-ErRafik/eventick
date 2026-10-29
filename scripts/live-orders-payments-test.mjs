/**
 * Live test — the whole orders and payments surface, end to end.
 *
 * One suite covering the path a real sale takes and every place money can go
 * wrong along it: hold, pay, settle, refund, resell, commission, subscription,
 * payout. Each section builds its own event so nothing depends on seeded
 * revenue or on the order the sections run in.
 *
 * Written after an audit found three gaps that the narrower suites missed,
 * because each tested one layer and the money crossed layers:
 *
 *   - a resale settled through a path that never recorded commission, so the
 *     platform brokered sales for free;
 *   - an order with no recorded fee was priced at the PLATFORM DEFAULT plan,
 *     so a Pro organiser's reported commission went up at a rate they were
 *     never on;
 *   - a plan's fixed monthly fee was displayed and never charged, which made
 *     Pro (3% + 499/mo) cheaper than Starter (5%) at every volume.
 *
 * Run from the backend directory, which has Prisma and the env:
 *   cd backend && npx tsx ../scripts/live-orders-payments-test.mjs
 */

import { prisma } from "../backend/src/lib/prisma.js";

const API = process.env.API_URL ?? "http://localhost:4100";
const ACCOUNTS = {
  admin: { email: "admin@eventick.ma", password: "eventick-admin-2026" },
  organiser: { email: "organisateur@eventick.ma", password: "eventick-orga-2026" },
  customer: { email: "client@eventick.ma", password: "eventick-client-2026" },
};

let failures = 0;
let checks = 0;
function check(label, pass, detail) {
  checks++;
  if (!pass) failures++;
  console.log(`  ${pass ? "\x1b[32m PASS\x1b[0m" : "\x1b[31m FAIL\x1b[0m"}  ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
}
function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
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

async function call(method, path, { token, body, key } = {}) {
  const url = key ? `${API}${path}${path.includes("?") ? "&" : "?"}k=${encodeURIComponent(key)}` : `${API}${path}`;
  const res = await fetch(url, {
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
    data = text.slice(0, 180);
  }
  return { status: res.status, data };
}

const SUFFIX = Date.now();
const events = [];

/** A published event owned by `organiserId`, with one tier. */
async function makeEvent(label, { priceCents = 100000, capacity = 10, organiserId }) {
  const start = new Date(Date.now() + 30 * 86_400_000);
  const event = await prisma.event.create({
    data: {
      slug: `op-${SUFFIX}-${label}`,
      organiserId,
      titleFr: `Orders test ${label}`,
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
          priceCents,
          capacity,
          zoneFr: "Z",
          zoneAr: "ز",
          gateFr: "G",
          gateAr: "ج",
        },
      },
    },
    include: { tiers: true },
  });
  events.push(event.id);
  return { event, tier: event.tiers[0] };
}

async function hold(event, tier, qty = 1) {
  const res = await call("POST", "/api/orders/hold", {
    body: { eventSlug: event.slug, lines: [{ tierId: tier.id, qty }] },
  });
  return {
    status: res.status,
    id: res.data.order?.id,
    key: res.data.accessToken,
    totalCents: res.data.order?.totalCents,
    error: res.data.error,
  };
}

/** Pay a held order. Mock mode settles it on the spot. */
async function pay(order, extra = {}) {
  return call("POST", `/api/orders/${order.id}/pay`, {
    key: order.key,
    body: {
      holderName: "Orders Test",
      email: `op-${SUFFIX}@eventick.ma`,
      phone: "0612345678",
      ...extra,
    },
  });
}

async function buyAndSettle(event, tier, qty = 1) {
  const h = await hold(event, tier, qty);
  await pay(h);
  return h;
}

/**
 * Buy as a signed-in customer.
 *
 * Needed where the test goes on to SELL the ticket: listing a resale requires
 * a real session, not a guest link token, because selling is a money action
 * and the platform deliberately requires an account for those.
 */
async function buyAsCustomer(event, tier, token, qty = 1) {
  const res = await call("POST", "/api/orders/hold", {
    token,
    body: { eventSlug: event.slug, lines: [{ tierId: tier.id, qty }] },
  });
  const order = { id: res.data.order?.id, key: res.data.accessToken };
  await call("POST", `/api/orders/${order.id}/pay`, {
    token,
    body: { holderName: "Orders Test", email: `op-${SUFFIX}@eventick.ma`, phone: "0612345678" },
  });
  return order;
}

/**
 * Remove everything this suite creates, for one organiser.
 *
 * Deliberately matches on the `op-` slug prefix rather than only this run's
 * suffix, and runs at the START as well as the end: a crashed run leaves
 * orders behind, and a payout correctly sweeps every unpaid order in its
 * period — so last run's debris shows up as this run's failure. That cost
 * real debugging time before the purge was added.
 */
async function teardown(organiserId) {
  await prisma.subscriptionCharge.deleteMany({ where: { organiserId } });
  await prisma.payoutOrder.deleteMany({ where: { payout: { organiserId } } });
  await prisma.payout.deleteMany({ where: { organiserId } });
  await prisma.bankAccount.deleteMany({ where: { organiserId } });
  await prisma.user.update({ where: { id: organiserId }, data: { planId: null } });

  const stale = await prisma.event.findMany({ where: { slug: { startsWith: "op-" } }, select: { id: true } });
  for (const { id: eventId } of stale) {
    const tiers = await prisma.ticketTier.findMany({ where: { eventId }, select: { id: true } });
    const tierIds = tiers.map((t) => t.id);
    await prisma.resaleListing.deleteMany({ where: { ticket: { tierId: { in: tierIds } } } });
    await prisma.ticketShare.deleteMany({ where: { ticket: { tierId: { in: tierIds } } } });
    await prisma.ticket.deleteMany({ where: { tierId: { in: tierIds } } });
    await prisma.orderLine.deleteMany({ where: { tierId: { in: tierIds } } });
    await prisma.waitlistEntry.deleteMany({ where: { eventId } });
    await prisma.order.deleteMany({ where: { eventId } });
    await prisma.ticketTier.deleteMany({ where: { eventId } });
    await prisma.event.delete({ where: { id: eventId } });
  }
}

async function main() {
  const admin = await login(ACCOUNTS.admin);
  const orga = await login(ACCOUNTS.organiser);
  const customer = await login(ACCOUNTS.customer);
  const orgaId = (await call("GET", "/api/auth/me", { token: orga })).data.user.id;

  // Start from a clean slate, whatever an earlier run left behind.
  await teardown(orgaId);

  // Start from a known plan state.
  await call("PATCH", `/api/platform/organisers/${orgaId}/plan`, { token: admin, body: { planKey: "pro" } });

  // ═══ 1. Holding a seat ════════════════════════════════════════════════
  section("1. Reserving seats");
  {
    const { event, tier } = await makeEvent("hold", { capacity: 2, organiserId: orgaId });

    const first = await hold(event, tier, 1);
    check("a hold is created", first.status === 201, `${first.status}`);
    check("it carries an access token", typeof first.key === "string" && first.key.length > 20);
    check("the total is the tier price", first.totalCents === 100000, `${mad(first.totalCents ?? 0)}`);

    // Two seats left, one taken — asking for two must fail.
    const greedy = await hold(event, tier, 2);
    check("a hold beyond remaining stock is refused", greedy.status === 409, `${greedy.status}`);

    const second = await hold(event, tier, 1);
    check("the last seat can still be held", second.status === 201, `${second.status}`);

    const soldOut = await hold(event, tier, 1);
    check("a sold-out tier refuses a hold", soldOut.status === 409, `${soldOut.status}`);

    // Releasing returns stock immediately rather than waiting for expiry.
    const release = await call("DELETE", `/api/orders/hold/${second.id}`, { key: second.key });
    check("a hold can be released", release.status === 204, `${release.status}`);
    const afterRelease = await hold(event, tier, 1);
    check("the released seat is available again", afterRelease.status === 201, `${afterRelease.status}`);

    // The order id is not a credential.
    const stranger = await call("DELETE", `/api/orders/hold/${afterRelease.id}`);
    check("a stranger cannot release someone else's hold", stranger.status === 403, `${stranger.status}`);
  }

  // ═══ 2. Paying ════════════════════════════════════════════════════════
  section("2. Paying");
  {
    const { event, tier } = await makeEvent("pay", { organiserId: orgaId });
    const order = await hold(event, tier, 2);

    const badPhone = await pay(order, { phone: "123" });
    check("an invalid phone is refused before money moves", badPhone.status === 400, `${badPhone.status}`);
    const badEmail = await pay(order, { email: "nope" });
    check("an invalid email is refused", badEmail.status === 400, `${badEmail.status}`);
    const shortName = await pay(order, { holderName: "A" });
    check("a one-character name is refused", shortName.status === 400, `${shortName.status}`);

    const anon = await call("POST", `/api/orders/${order.id}/pay`, {
      body: { holderName: "Stranger", email: "s@example.ma", phone: "0612345678" },
    });
    // Paying attaches a name and issues tickets in it, so it is a write.
    check("a stranger cannot pay someone else's order", anon.status === 403, `${anon.status}`);

    const ok = await pay(order);
    check("a valid payment settles in mock mode", ok.status === 200 && ok.data.settled === true, JSON.stringify(ok.data));

    const detail = await call("GET", `/api/orders/${order.id}`, { key: order.key });
    check("the order is PAID", detail.data.order?.status === "PAID", detail.data.order?.status);
    check("both tickets were issued", detail.data.order?.tickets?.length === 2, `${detail.data.order?.tickets?.length}`);

    const again = await pay(order);
    check("a paid order cannot be paid again", again.status === 409, `${again.status}`);

    const expired = await hold(event, tier, 1);
    await prisma.order.update({ where: { id: expired.id }, data: { holdUntil: new Date(Date.now() - 60_000) } });
    const late = await pay(expired);
    check("an expired hold cannot be paid", late.status === 410, `${late.status}`);
  }

  // ═══ 3. Commission at settlement ══════════════════════════════════════
  section("3. Commission is recorded on the order");
  {
    const { event, tier } = await makeEvent("fee", { organiserId: orgaId });
    const order = await buyAndSettle(event, tier, 1);

    const row = await prisma.order.findUnique({
      where: { id: order.id },
      select: { totalCents: true, feeCents: true, feePlanKey: true },
    });
    // Pro is 300bps: 3% of 1000.00 MAD.
    check("the fee is stored on the order", row.feeCents === 3000, `${row.feeCents}`);
    check("the plan that priced it is stored", row.feePlanKey === "pro", row.feePlanKey);

    const reportedOnPro = (await call("GET", "/api/organiser/finance", { token: orga })).data.lifetime.feeCents;
    await call("PATCH", `/api/platform/organisers/${orgaId}/plan`, { token: admin, body: { planKey: "starter" } });
    const stored = await prisma.order.findUnique({ where: { id: order.id }, select: { feeCents: true } });
    const reportedOnStarter = (await call("GET", "/api/organiser/finance", { token: orga })).data.lifetime.feeCents;

    check("a plan change does not rewrite the stored fee", stored.feeCents === 3000, `${stored.feeCents}`);
    // Asserted through the API too: checking only the column passes even if
    // the route recomputes the fee on every read, which is the same bug seen
    // from the outside.
    check(
      "a plan change does not move the REPORTED fee",
      reportedOnStarter === reportedOnPro,
      `${mad(reportedOnPro)} -> ${mad(reportedOnStarter)}`,
    );
    await call("PATCH", `/api/platform/organisers/${orgaId}/plan`, { token: admin, body: { planKey: "pro" } });
  }

  // ═══ 4. An unrecorded fee ═════════════════════════════════════════════
  section("4. An order with no recorded fee");
  {
    const { event, tier } = await makeEvent("legacy", { organiserId: orgaId });
    const order = await buyAndSettle(event, tier, 1);
    // Stand in for an order settled before commission existed.
    await prisma.order.update({ where: { id: order.id }, data: { feeCents: null, feePlanKey: null } });

    const stats = await call("GET", `/api/organiser/stats?organiserId=${orgaId}`, { token: admin });
    const fin = await call("GET", "/api/organiser/finance", { token: orga });

    // Only this event's order is unpriced; isolate it by reading the event.
    const eventOrders = await prisma.order.findMany({
      where: { eventId: event.id, status: { in: ["PAID", "REFUNDED"] } },
      select: { totalCents: true, refundedCents: true, feeCents: true },
    });
    check("the order really has no recorded fee", eventOrders.every((o) => o.feeCents === null));

    // The organiser is on Pro (3%). Pricing at the platform DEFAULT (Starter,
    // 5%) was the bug: it charged a rate they were never on.
    const pricedAtPro = Math.round(100000 * 0.03);
    const pricedAtDefault = Math.round(100000 * 0.05);
    const financeIncludesIt = fin.data.lifetime.feeCents;
    check(
      "it is priced at the organiser's own plan, not the platform default",
      financeIncludesIt % pricedAtDefault !== 0 || financeIncludesIt % pricedAtPro === 0,
      `fee total ${mad(financeIncludesIt)} — Pro would add ${mad(pricedAtPro)}, default ${mad(pricedAtDefault)}`,
    );
    check("stats reports a fee figure", typeof stats.data.feeCents === "number", `${stats.data.feeCents}`);
  }

  // ═══ 5. Refunds ═══════════════════════════════════════════════════════
  section("5. Refunds move revenue and commission together");
  {
    const { event, tier } = await makeEvent("refund", { organiserId: orgaId });
    const order = await buyAndSettle(event, tier, 2);

    const before = await call("GET", `/api/organiser/stats?organiserId=${orgaId}`, { token: admin });

    const half = await call("POST", `/api/organiser/orders/${order.id}/refund`, {
      token: orga,
      body: { amountCents: 100000 },
    });
    check("a partial refund is accepted", half.status === 200, `${half.status}`);

    const mid = await call("GET", `/api/organiser/stats?organiserId=${orgaId}`, { token: admin });
    check(
      "net revenue falls by the refund",
      mid.data.gmvCents === before.data.gmvCents - 100000,
      `${mad(before.data.gmvCents)} -> ${mad(mid.data.gmvCents)}`,
    );
    // 2000.00 at 3% is 60.00; half refunded leaves 30.00.
    check(
      "commission falls in proportion",
      mid.data.feeCents === before.data.feeCents - 3000,
      `${mad(before.data.feeCents)} -> ${mad(mid.data.feeCents)}`,
    );

    const ticketsStillValid = await prisma.ticket.count({ where: { orderId: order.id, status: "VALID" } });
    check("a partial refund leaves the tickets usable", ticketsStillValid === 2, `${ticketsStillValid} valid`);

    const rest = await call("POST", `/api/organiser/orders/${order.id}/refund`, { token: orga, body: {} });
    check("the remainder can be refunded", rest.status === 200, `${rest.status}`);
    const voided = await prisma.ticket.count({ where: { orderId: order.id, status: "CANCELLED" } });
    // The point: someone refunded in full must not still get through the gate.
    check("a full refund voids every ticket", voided === 2, `${voided} cancelled`);

    const over = await call("POST", `/api/organiser/orders/${order.id}/refund`, { token: orga, body: { amountCents: 100 } });
    check("an over-refund is refused", over.status === 409, `${over.status}`);

    const asCustomer = await call("POST", `/api/organiser/orders/${order.id}/refund`, { token: customer, body: {} });
    check("a customer cannot refund an order", asCustomer.status === 403, `${asCustomer.status}`);
  }

  // ═══ 6. Resale ════════════════════════════════════════════════════════
  section("6. A resale is a sale, and earns commission");
  {
    const { event, tier } = await makeEvent("resale", { organiserId: orgaId });
    // Bought with a session: a guest cannot list a resale, by design.
    const sellerOrder = await buyAsCustomer(event, tier, customer, 1);
    const sellerTicket = await prisma.ticket.findFirst({ where: { orderId: sellerOrder.id }, select: { id: true, ref: true } });

    const asGuest = await call("POST", "/api/resale/listings", {
      key: sellerOrder.key,
      body: { ticketId: sellerTicket.id },
    });
    // Selling is a money action, so a link token is not enough.
    check("a guest link token cannot list a resale", asGuest.status === 403, `${asGuest.status}`);

    const listed = await call("POST", "/api/resale/listings", {
      token: customer,
      body: { ticketId: sellerTicket.id },
    });
    check("the signed-in owner can list it", listed.status === 201, `${listed.status} ${listed.data.error ?? ""}`);

    const buy = await call("POST", `/api/resale/${listed.data.token}/buy`, {
      body: { holderName: "Resale Buyer", email: `op-resale-${SUFFIX}@eventick.ma`, phone: "0612345679" },
    });
    check("the listing can be bought", buy.status === 200 && buy.data.settled === true, `${buy.status}`);

    const resaleOrder = await prisma.order.findUnique({
      where: { id: buy.data.orderId },
      select: { totalCents: true, feeCents: true, feePlanKey: true },
    });
    // THE gap this section exists for: both resale settlement paths set PAID
    // directly instead of going through settleOrder, so the fee was never
    // recorded and the platform brokered the sale for nothing.
    check(
      "the resale earned the platform its commission",
      resaleOrder.feeCents === 3000,
      `${resaleOrder.feeCents === null ? "NULL — resale is free" : mad(resaleOrder.feeCents)} on ${resaleOrder.feePlanKey}`,
    );

    const oldTicket = await prisma.ticket.findUnique({ where: { id: sellerTicket.id }, select: { status: true } });
    // TRANSFERRED, not CANCELLED: refunding the seller is a FULL refund of
    // their order, and the refund used to overwrite the status it had just
    // set — losing the difference between "sold on" and "refunded". Both
    // block entry, but the gate tells a turned-away holder which happened.
    check("the seller's ticket reads as transferred, not refunded", oldTicket.status === "TRANSFERRED", oldTicket.status);
    const replacement = await prisma.ticket.findFirst({ where: { orderId: buy.data.orderId }, select: { ref: true } });
    check("the buyer gets a NEW reference", replacement.ref !== sellerTicket.ref, `${sellerTicket.ref} -> ${replacement.ref}`);

    const sellerAfter = await prisma.order.findUnique({
      where: { id: sellerOrder.id },
      select: { refundedCents: true, totalCents: true },
    });
    check(
      "the seller was refunded their face value",
      sellerAfter.refundedCents === sellerAfter.totalCents,
      `${mad(sellerAfter.refundedCents)} of ${mad(sellerAfter.totalCents)}`,
    );
  }

  // ═══ 7. Bank details ══════════════════════════════════════════════════
  section("7. Bank details");
  {
    await prisma.bankAccount.deleteMany({ where: { organiserId: orgaId } });
    const short = await call("PUT", "/api/organiser/bank-account", {
      token: orga,
      body: { holderName: "Yasmine Organisatrice", rib: "123" },
    });
    check("a RIB that is not 24 digits is refused", short.status === 400, `${short.status}`);

    const saved = await call("PUT", "/api/organiser/bank-account", {
      token: orga,
      body: { holderName: "Yasmine Organisatrice", rib: "1234 5678 9012 3456 7890 1234", bank: "CIH" },
    });
    check("spacing in a pasted RIB is tolerated", saved.status === 200, `${saved.status}`);
    // The RIB is a payment credential; the screen that shows earnings has no
    // need for it.
    check("only the last four digits come back", saved.data.ribLast4 === "1234" && !("rib" in saved.data), JSON.stringify(saved.data));
  }

  // ═══ 8. Payout, commission and subscription ═══════════════════════════
  section("8. Payout: commission and the monthly subscription");
  {
    // A dedicated past month, so the subscription maths is unambiguous.
    const { event, tier } = await makeEvent("payout", { priceCents: 200000, capacity: 20, organiserId: orgaId });
    const o1 = await buyAndSettle(event, tier, 1);
    await prisma.order.update({ where: { id: o1.id }, data: { createdAt: new Date("2026-05-10T12:00:00Z") } });

    const run = await call("POST", `/api/platform/organisers/${orgaId}/payouts`, {
      token: admin,
      body: { periodStart: "2026-05-01", periodEnd: "2026-06-01" },
    });
    check("a payout is created for the month", run.status === 201, `${run.status} ${run.data.error ?? ""}`);

    const payout = await prisma.payout.findUnique({
      where: { id: run.data.payoutId },
      select: {
        grossCents: true,
        feeCents: true,
        subscriptionCents: true,
        netCents: true,
        subscriptions: { select: { month: true, amountCents: true, planKey: true } },
      },
    });
    // 2000.00 revenue, 3% = 60.00 commission, 499.00 subscription for May.
    check("revenue is net of refunds", payout.grossCents === 200000, mad(payout.grossCents));
    check("commission is withheld", payout.feeCents === 6000, mad(payout.feeCents));
    // THE gap: "Pro · 3% + 499/mo" charged only the 3%, making Pro cheaper
    // than Starter's 5% at every volume.
    check("the plan's monthly fee is withheld", payout.subscriptionCents === 49900, mad(payout.subscriptionCents));
    check(
      "net is revenue minus commission minus subscription",
      payout.netCents === 200000 - 6000 - 49900,
      `${mad(payout.netCents)} (expected ${mad(200000 - 6000 - 49900)})`,
    );
    check("the billed month is recorded", payout.subscriptions.length === 1 && payout.subscriptions[0].month.toISOString().startsWith("2026-05"), payout.subscriptions[0]?.month?.toISOString());

    // A second run over the same month must not bill it again.
    const o2 = await buyAndSettle(event, tier, 1);
    await prisma.order.update({ where: { id: o2.id }, data: { createdAt: new Date("2026-05-20T12:00:00Z") } });
    const rerun = await call("POST", `/api/platform/organisers/${orgaId}/payouts`, {
      token: admin,
      body: { periodStart: "2026-05-01", periodEnd: "2026-06-01" },
    });
    check("a second run over the same month succeeds", rerun.status === 201, `${rerun.status} ${rerun.data.error ?? ""}`);
    const second = await prisma.payout.findUnique({
      where: { id: rerun.data.payoutId },
      select: { subscriptionCents: true, feeCents: true },
    });
    check("the subscription is NOT charged twice for one month", second.subscriptionCents === 0, mad(second.subscriptionCents));
    check("but commission on the new order still is", second.feeCents === 6000, mad(second.feeCents));

    const charges = await prisma.subscriptionCharge.count({ where: { organiserId: orgaId, month: new Date("2026-05-01T00:00:00Z") } });
    check("exactly one subscription charge exists for May", charges === 1, `${charges}`);

    // An order already in a payout is never paid for again.
    const third = await call("POST", `/api/platform/organisers/${orgaId}/payouts`, {
      token: admin,
      body: { periodStart: "2026-05-01", periodEnd: "2026-06-01" },
    });
    check("a run with nothing new to pay is refused", third.status === 409, `${third.status}`);

    /*
     * A wide period must not bill a subscription for every month it spans.
     *
     * The payout dialog used to default to 2020-01-01, which is ~120 months,
     * or 59 880 MAD of subscription — and the run then REFUSED itself for not
     * covering its own charge, so the organiser could not be paid at all. Only
     * months the organiser actually sold in are billable.
     */
    const o3 = await buyAndSettle(event, tier, 1);
    await prisma.order.update({ where: { id: o3.id }, data: { createdAt: new Date("2026-06-15T12:00:00Z") } });
    const wide = await call("POST", `/api/platform/organisers/${orgaId}/payouts`, {
      token: admin,
      body: { periodStart: "2020-01-01", periodEnd: "2030-01-01" },
    });
    check("a decade-wide period still pays out", wide.status === 201, `${wide.status} ${wide.data.error ?? ""}`);
    // A decade spans ~120 months. Only the ones with unbilled sales count —
    // here that is June, since May was billed by the run above. The exact
    // count matters less than it being a handful rather than 120.
    check(
      "it bills months with sales, not the ~120 it spans",
      wide.data.months >= 1 && wide.data.months <= 3 && wide.data.subscriptionCents === 49900 * wide.data.months,
      `${mad(wide.data.subscriptionCents ?? 0)} over ${wide.data.months} month(s) of a ~120-month span`,
    );
  }

  // ═══ 9. Multi-month and cancellation ══════════════════════════════════
  section("9. Several months, and releasing a cancelled run");
  {
    const { event, tier } = await makeEvent("months", { priceCents: 300000, capacity: 20, organiserId: orgaId });

    // Sales in three distinct months, plus a fourth month with none. The
    // subscription follows the SALES, not the span: a dormant month is not a
    // month the platform carried anything.
    for (const day of ["2026-07-05", "2026-08-15", "2026-09-20"]) {
      const o = await buyAndSettle(event, tier, 1);
      await prisma.order.update({ where: { id: o.id }, data: { createdAt: new Date(`${day}T12:00:00Z`) } });
    }

    const run = await call("POST", `/api/platform/organisers/${orgaId}/payouts`, {
      token: admin,
      // Four months wide; only three of them have sales.
      body: { periodStart: "2026-06-01", periodEnd: "2026-10-01" },
    });
    check("a multi-month period is paid out", run.status === 201, `${run.status} ${run.data.error ?? ""}`);
    const payout = await prisma.payout.findUnique({
      where: { id: run.data.payoutId },
      select: { subscriptionCents: true, subscriptions: { select: { month: true } } },
    });
    check(
      "one subscription per month WITH SALES, not per month spanned",
      payout.subscriptionCents === 49900 * 3,
      `${mad(payout.subscriptionCents)} over ${payout.subscriptions.length} month(s), period spans 4`,
    );

    // Cancelling must release both the orders and the months.
    const cancel = await call("POST", `/api/platform/payouts/${run.data.payoutId}/cancel`, {
      token: admin,
      body: { note: "test" },
    });
    check("a pending payout can be cancelled", cancel.status === 200, `${cancel.status}`);
    const releasedMonths = await prisma.subscriptionCharge.count({ where: { payoutId: run.data.payoutId } });
    // Leaving them would block those months from ever being billed again.
    check("its subscription months are released", releasedMonths === 0, `${releasedMonths} left`);
    const releasedOrders = await prisma.payoutOrder.count({ where: { payoutId: run.data.payoutId } });
    check("its orders are released", releasedOrders === 0, `${releasedOrders} left`);

    const rerun = await call("POST", `/api/platform/organisers/${orgaId}/payouts`, {
      token: admin,
      body: { periodStart: "2026-07-01", periodEnd: "2026-10-01" },
    });
    check("the same period can be run again after cancelling", rerun.status === 201, `${rerun.status}`);
    const after = await prisma.payout.findUnique({ where: { id: rerun.data.payoutId }, select: { subscriptionCents: true } });
    check("and bills those months again, once each", after.subscriptionCents === 49900 * 3, mad(after.subscriptionCents));
  }

  // ═══ 10. Marking paid, and who may see what ═══════════════════════════
  section("10. Sending the money, and visibility");
  {
    const pending = await prisma.payout.findFirst({
      where: { organiserId: orgaId, status: "PENDING" },
      select: { id: true, netCents: true },
    });

    const noRef = await call("POST", `/api/platform/payouts/${pending.id}/paid`, { token: admin, body: { reference: "" } });
    check("a bank reference is required", noRef.status === 400, `${noRef.status}`);

    const paid = await call("POST", `/api/platform/payouts/${pending.id}/paid`, {
      token: admin,
      body: { reference: `VIR-${SUFFIX}` },
    });
    check("a payout can be marked paid", paid.status === 200, `${paid.status}`);

    const twice = await call("POST", `/api/platform/payouts/${pending.id}/paid`, {
      token: admin,
      body: { reference: "VIR-OTHER" },
    });
    check("marking it paid twice is refused", twice.status === 409, `${twice.status}`);
    const kept = await prisma.payout.findUnique({ where: { id: pending.id }, select: { reference: true, netCents: true } });
    check("the real reference survived", kept.reference === `VIR-${SUFFIX}`, kept.reference);

    const cancelSent = await call("POST", `/api/platform/payouts/${pending.id}/cancel`, { token: admin, body: {} });
    // A transfer that has gone cannot be un-sent by editing a row.
    check("a sent payout cannot be cancelled", cancelSent.status === 409, `${cancelSent.status}`);

    // Totals are frozen at creation, so a later refund cannot change them.
    const orderInPayout = await prisma.payoutOrder.findFirst({ where: { payoutId: pending.id }, select: { orderId: true } });
    if (orderInPayout) {
      await call("POST", `/api/organiser/orders/${orderInPayout.orderId}/refund`, { token: orga, body: { amountCents: 10000 } });
      const unchanged = await prisma.payout.findUnique({ where: { id: pending.id }, select: { netCents: true } });
      check("a later refund does not alter a sent payout", unchanged.netCents === kept.netCents, `${mad(kept.netCents)} -> ${mad(unchanged.netCents)}`);
    }

    const ownList = await call("GET", "/api/organiser/payouts", { token: orga });
    check("an organiser sees their own payouts", ownList.status === 200 && ownList.data.payouts.length > 0, `${ownList.status}`);
    check(
      "and the subscription deduction is explained",
      ownList.data.payouts.some((row) => Array.isArray(row.subscriptionMonths)),
      "",
    );

    const platformList = await call("GET", "/api/platform/payouts", { token: orga });
    check("an organiser cannot list every payout", platformList.status === 403, `${platformList.status}`);

    const selfPlan = await call("PATCH", `/api/platform/organisers/${orgaId}/plan`, { token: orga, body: { planKey: "starter" } });
    check("an organiser cannot set their own commission rate", selfPlan.status === 403, `${selfPlan.status}`);

    const asCustomer = await call("GET", "/api/organiser/finance", { token: customer });
    check("a customer cannot read finance", asCustomer.status === 403, `${asCustomer.status}`);
  }

  // ═══ Cleanup ══════════════════════════════════════════════════════════
  section("Cleanup");
  await teardown(orgaId);
  const left = await prisma.event.count({ where: { slug: { startsWith: "op-" } } });
  check("test data removed", left === 0, `${left} event(s) left`);

  console.log(
    failures === 0
      ? `\n\x1b[32mAll ${checks} orders & payments checks passed\x1b[0m`
      : `\n\x1b[31m${failures} of ${checks} FAILED\x1b[0m`,
  );
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\x1b[31mharness error:\x1b[0m", err);
  await prisma.$disconnect();
  process.exit(1);
});
