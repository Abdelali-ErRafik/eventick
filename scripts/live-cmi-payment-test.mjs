/**
 * Live test — the CMI callback only takes money when it delivers something.
 *
 * CMI is a REDIRECT gateway, and that single fact is what these checks are
 * about. Stripe confirmed a card in-page, in seconds, so the window between
 * "buyer starts paying" and "payment settles" was negligible. A CMI buyer
 * leaves for CMI's own hosted page and takes as long as they take to find
 * their card and pass 3-D Secure — which can comfortably outlast the
 * 15-minute hold. Three things can therefore be true by the time the callback
 * arrives, none of which could happen under Stripe:
 *
 *   1. The hold lapsed but the sweeper has not run (up to 5 min later), so the
 *      order is still PENDING and would settle against seats that availability
 *      already handed to someone else — an oversell.
 *   2. The sweeper ran and CANCELLED the order. Settlement is correctly
 *      refused, but replying ACTION=POSTAUTH anyway charges a buyer who gets
 *      no ticket at all.
 *   3. For a resale, the listing was cancelled or sold to someone else while
 *      the buyer was paying.
 *
 * Only `ACTION=POSTAUTH` captures the money, so the rule under test is: send
 * it if and only if the buyer ends up holding something. A replay must still
 * send it (the money is genuinely owed) without minting a second ticket.
 *
 * Needs CMI configured, because the callback is signature-verified:
 *   cd backend && npx tsx ../scripts/live-cmi-payment-test.mjs
 */

import { createHash } from "node:crypto";
import { prisma } from "../backend/src/lib/prisma.js";

const API = process.env.API_URL ?? "http://localhost:4100";
const STORE_KEY = process.env.CMI_STORE_KEY;
const CLIENT_ID = process.env.CMI_CLIENT_ID;

if (!STORE_KEY || !CLIENT_ID) {
  console.log(
    "\x1b[33mCMI_CLIENT_ID / CMI_STORE_KEY are not set — these checks need the gateway configured.\x1b[0m",
  );
  process.exit(0);
}

let failures = 0;
function check(label, pass, detail) {
  if (!pass) failures++;
  console.log(`  ${pass ? "\x1b[32m PASS\x1b[0m" : "\x1b[31m FAIL\x1b[0m"}  ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
}

// ── Signing, mirroring what CMI itself does ──────────────────────────────
const esc = (v) => String(v ?? "").trim().replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
function signed(fields) {
  const names = Object.keys(fields)
    .filter((k) => !["hash", "encoding"].includes(k.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  let plain = "";
  for (const n of names) plain += esc(fields[n]) + "|";
  return { ...fields, HASH: createHash("sha512").update(plain + esc(STORE_KEY), "utf8").digest("base64") };
}

/** Post a callback exactly as CMI would, and return its bare-text reply. */
async function callback(oid, amountMad, overrides = {}) {
  const body = signed({
    clientid: CLIENT_ID,
    oid,
    ProcReturnCode: "00",
    Response: "Approved",
    TransId: `LT${Date.now()}${Math.floor(Math.random() * 1000)}`,
    amount: amountMad,
    MaskedPan: "423456******7890",
    CardType: "VISA",
    ...overrides,
  });
  const res = await fetch(`${API}/api/webhooks/cmi`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  return (await res.text()).trim();
}

const SUFFIX = Date.now();
const created = { events: [] };

/** A published event with one tier of exactly `capacity` seats. */
async function makeEvent(capacity, label) {
  const start = new Date(Date.now() + 30 * 86_400_000);
  const event = await prisma.event.create({
    data: {
      slug: `cmi-live-${SUFFIX}-${label}`,
      titleFr: `CMI live ${label}`,
      titleAr: "اختبار",
      category: "concert",
      city: "Casablanca",
      venueFr: "Salle", venueAr: "قاعة", address: "1 rue",
      startAt: start, endAt: start, doorsAt: start,
      image: "x.jpg",
      blurbFr: "b", blurbAr: "ب", aboutFr: "a", aboutAr: "أ", ageFr: "+18", ageAr: "+18",
      status: "PUBLISHED",
      tiers: {
        create: {
          nameFr: "Unique", nameAr: "وحيد", blurbFr: "b", blurbAr: "ب",
          priceCents: 20000, capacity,
          zoneFr: "Z", zoneAr: "ز", gateFr: "G", gateAr: "ج",
        },
      },
    },
    include: { tiers: true },
  });
  created.events.push(event.id);
  return { event, tier: event.tiers[0] };
}

async function hold(slug, tierId, qty = 1) {
  const res = await fetch(`${API}/api/orders/hold`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventSlug: slug, lines: [{ tierId, qty }] }),
  });
  const data = await res.json();
  return {
    ok: res.status === 201,
    id: data.order?.id,
    amount: ((data.order?.totalCents ?? 0) / 100).toFixed(2),
  };
}

const ticketsFor = (orderId) => prisma.ticket.count({ where: { orderId } });
const statusOf = async (orderId) =>
  (await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } }))?.status;

async function main() {
  // ── The ordinary case still works ───────────────────────────────────────
  console.log("\n\x1b[1mA payment that arrives in time\x1b[0m");
  {
    const { event, tier } = await makeEvent(5, "happy");
    const o = await hold(event.slug, tier.id, 2);
    const reply = await callback(o.id, o.amount);
    check("the money is taken", reply === "ACTION=POSTAUTH", reply);
    check("both tickets are issued", (await ticketsFor(o.id)) === 2, `${await ticketsFor(o.id)}`);
    check("the order is PAID", (await statusOf(o.id)) === "PAID");

    // CMI retries anything it considers unanswered.
    const again = await callback(o.id, o.amount);
    check("a replay still accepts the money", again === "ACTION=POSTAUTH", again);
    check("a replay does NOT issue more tickets", (await ticketsFor(o.id)) === 2, `${await ticketsFor(o.id)}`);
  }

  // ── Swept order: charging here would be charging for nothing ────────────
  console.log("\n\x1b[1mPayment arrives after the order was cancelled\x1b[0m");
  {
    const { event, tier } = await makeEvent(5, "swept");
    const o = await hold(event.slug, tier.id);
    // What the sweeper does to a lapsed hold.
    await prisma.order.update({ where: { id: o.id }, data: { status: "CANCELLED", holdUntil: null } });

    const reply = await callback(o.id, o.amount);
    check("the money is REFUSED", reply === "FAILURE", reply);
    check("no ticket is minted", (await ticketsFor(o.id)) === 0);
    check("the order stays CANCELLED", (await statusOf(o.id)) === "CANCELLED");
  }

  // ── The oversell window the redirect flow opens ─────────────────────────
  console.log("\n\x1b[1mLate payment for a seat someone else has taken\x1b[0m");
  {
    const { event, tier } = await makeEvent(1, "oversell");
    const late = await hold(event.slug, tier.id);
    check("buyer A holds the only seat", late.ok);

    // A's hold lapses while they are on CMI's page. The sweeper has NOT run,
    // so A's order is still PENDING — this is the dangerous window.
    await prisma.order.update({ where: { id: late.id }, data: { holdUntil: new Date(Date.now() - 60_000) } });

    const prompt = await hold(event.slug, tier.id);
    check("buyer B can take the freed seat", prompt.ok);
    check("B's payment succeeds", (await callback(prompt.id, prompt.amount)) === "ACTION=POSTAUTH");

    const reply = await callback(late.id, late.amount);
    check("A's late payment is REFUSED", reply === "FAILURE", reply);
    check("A gets no ticket", (await ticketsFor(late.id)) === 0);
    const issued = await prisma.ticket.count({ where: { tierId: tier.id, status: { in: ["VALID", "USED"] } } });
    check("the tier is NOT oversold", issued === 1, `${issued} ticket(s) for capacity 1`);
  }

  // ── Resale: the listing can go while the buyer is paying ────────────────
  console.log("\n\x1b[1mResale whose listing disappeared mid-payment\x1b[0m");
  {
    const { event, tier } = await makeEvent(5, "resale");
    const sellerOrder = await prisma.order.create({
      data: {
        eventId: event.id, status: "PAID", holderName: "Seller",
        email: "seller@eventick.ma", phone: "0612345678",
        subtotalCents: tier.priceCents, totalCents: tier.priceCents, paymentRef: "SEED",
        tickets: { create: { ref: `LT-${SUFFIX}`, tierId: tier.id, holderName: "Seller" } },
      },
      include: { tickets: true },
    });
    const sellerTicket = sellerOrder.tickets[0];
    const listing = await prisma.resaleListing.create({
      data: { ticketId: sellerTicket.id, priceCents: tier.priceCents, token: `lt-${SUFFIX}`, status: "LISTED" },
    });

    const res = await fetch(`${API}/api/resale/${listing.token}/buy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holderName: "Resale Buyer", email: "rb@eventick.ma", phone: "0612345679" }),
    });
    const buy = await res.json();
    check("the resale buyer is sent to CMI", buy.mode === "cmi", buy.mode ?? buy.error);

    // The seller changes their mind while the buyer is on CMI's page.
    await prisma.resaleListing.update({
      where: { id: listing.id },
      data: { status: "CANCELLED", closedAt: new Date() },
    });

    const reply = await callback(buy.orderId, (tier.priceCents / 100).toFixed(2));
    check("the money is REFUSED", reply === "FAILURE", reply);
    check("no replacement ticket is minted", (await ticketsFor(buy.orderId)) === 0);
    check("the buyer's order is not left looking PAID", (await statusOf(buy.orderId)) === "PENDING");
    const seller = await prisma.ticket.findUnique({ where: { id: sellerTicket.id }, select: { status: true } });
    check("the seller keeps their seat", seller.status === "VALID", seller.status);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────
  console.log("\n\x1b[1mCleanup\x1b[0m");
  for (const eventId of created.events) {
    const tiers = await prisma.ticketTier.findMany({ where: { eventId }, select: { id: true } });
    const tierIds = tiers.map((t) => t.id);
    await prisma.resaleListing.deleteMany({ where: { ticket: { tierId: { in: tierIds } } } });
    await prisma.ticket.deleteMany({ where: { tierId: { in: tierIds } } });
    await prisma.orderLine.deleteMany({ where: { tierId: { in: tierIds } } });
    await prisma.order.deleteMany({ where: { eventId } });
    await prisma.ticketTier.deleteMany({ where: { eventId } });
    await prisma.event.delete({ where: { id: eventId } });
  }
  const left = await prisma.event.count({ where: { slug: { startsWith: `cmi-live-${SUFFIX}` } } });
  check("test data removed", left === 0, `${left} event(s) left`);

  console.log(
    failures === 0
      ? "\n\x1b[32mAll CMI payment checks passed\x1b[0m"
      : `\n\x1b[31m${failures} FAILED\x1b[0m`,
  );
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\x1b[31mharness error:\x1b[0m", err);
  await prisma.$disconnect();
  process.exit(1);
});
