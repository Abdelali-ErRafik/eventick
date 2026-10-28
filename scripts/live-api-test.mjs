/**
 * Live API test — every route, every role.
 *
 * Exercises all 41 endpoints against the running backend and through the
 * Next.js proxy, as four callers: anonymous, CUSTOMER, ORGANISER, ADMIN.
 * Checks both that the happy path works AND that each role is refused what
 * it should not reach, because an endpoint that works is only half the test.
 *
 * Creates its own data and deletes it at the end.
 */

const API = process.env.API ?? "http://localhost:4100";
const PROXY = process.env.PROXY ?? "http://localhost:3100";

const ACCOUNTS = {
  admin: { email: "admin@eventick.ma", password: "eventick-admin-2026" },
  organiser: { email: "organisateur@eventick.ma", password: "eventick-orga-2026" },
  customer: { email: "client@eventick.ma", password: "eventick-client-2026" },
};

const results = [];
let group = "";

function setGroup(name) {
  group = name;
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

function record(label, pass, detail) {
  results.push({ group, label, pass, detail });
  const mark = pass ? "\x1b[32m PASS\x1b[0m" : "\x1b[31m FAIL\x1b[0m";
  console.log(`  ${mark}  ${label}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
}

async function call(method, path, { token, body, base = API, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !form) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 80);
  }
  return { status: res.status, data, contentType: res.headers.get("content-type") ?? "" };
}

/** Assert an exact status. */
async function expectStatus(label, method, path, expected, opts = {}) {
  const r = await call(method, path, opts);
  const list = Array.isArray(expected) ? expected : [expected];
  const pass = list.includes(r.status);
  record(label, pass, `${r.status}${pass ? "" : ` (want ${list.join("/")})`}`);
  return r;
}

const tokens = {};
const created = { orders: [], promos: [], events: [] };

// ─────────────────────────────────────────────────────────────── auth ──
setGroup("AUTH  /api/auth");

for (const [role, creds] of Object.entries(ACCOUNTS)) {
  const r = await call("POST", "/api/auth/login", { body: creds });
  tokens[role] = r.data?.token;
  record(`login as ${role}`, r.status === 200 && Boolean(r.data?.token), `${r.status} role=${r.data?.user?.role ?? "?"}`);
}

await expectStatus("login with wrong password rejected", "POST", "/api/auth/login", 401, {
  body: { email: ACCOUNTS.admin.email, password: "wrong-password" },
});

const newEmail = `livetest-${Date.now()}@example.com`;
const reg = await call("POST", "/api/auth/register", {
  body: { name: "Live Test User", email: newEmail, password: "test-password-123" },
});
record("register creates a CUSTOMER", reg.status === 201 && reg.data?.user?.role === "CUSTOMER", `${reg.status} role=${reg.data?.user?.role}`);
const newUserToken = reg.data?.token;
const newUserId = reg.data?.user?.id;

await expectStatus("register duplicate email rejected", "POST", "/api/auth/register", 422, {
  body: { name: "Dup", email: ACCOUNTS.admin.email, password: "test-password-123" },
});
await expectStatus("register weak password rejected", "POST", "/api/auth/register", 400, {
  body: { name: "Weak", email: `w-${Date.now()}@example.com`, password: "123" },
});

await expectStatus("GET /auth/me anonymous", "GET", "/api/auth/me", 401);
await expectStatus("GET /auth/me as customer", "GET", "/api/auth/me", 200, { token: tokens.customer });
await expectStatus("PATCH /auth/me renames self", "PATCH", "/api/auth/me", 200, {
  token: newUserToken,
  body: { name: "Renamed User" },
});
await expectStatus("GET /auth/me with garbage token", "GET", "/api/auth/me", 401, { token: "not-a-jwt" });

// Role promotion: admin only.
await expectStatus("promote role as customer → 403", "PATCH", `/api/auth/users/${newUserId}/role`, 403, {
  token: tokens.customer,
  body: { role: "ORGANISER" },
});
await expectStatus("promote role as organiser → 403", "PATCH", `/api/auth/users/${newUserId}/role`, 403, {
  token: tokens.organiser,
  body: { role: "ORGANISER" },
});
await expectStatus("promote role as admin → 200", "PATCH", `/api/auth/users/${newUserId}/role`, 200, {
  token: tokens.admin,
  body: { role: "ORGANISER" },
});

// ─────────────────────────────────────────────────────────── public ──
setGroup("PUBLIC  /api/events, /api/health, /api/ready");

const events = await expectStatus("GET /events (anonymous)", "GET", "/api/events", 200);
const slug = events.data?.events?.[0]?.slug;
const tierId = events.data?.events?.[0]?.tiers?.[0]?.id;
record("catalogue returns events", Array.isArray(events.data?.events) && events.data.events.length > 0, `${events.data?.events?.length ?? 0} events`);

await expectStatus("GET /events/:slug", "GET", `/api/events/${slug}`, 200);
await expectStatus("GET /events/:slug unknown → 404", "GET", "/api/events/no-such-event-xyz", 404);
await expectStatus("GET /events/:slug/quote-promo (valid code)", "GET", `/api/events/${slug}/quote-promo?code=SAFRAN15&subtotalCents=100000`, 200);
await expectStatus("GET /availability/:slug", "GET", `/api/orders/availability/${slug}`, 200);
await expectStatus("GET /api/health", "GET", "/api/health", 200);
const ready = await expectStatus("GET /api/ready (checks DB)", "GET", "/api/ready", 200);
record("readiness actually probes the DB", ready.data?.db === "up", `db=${ready.data?.db}`);
await expectStatus("unknown /api route → 404", "GET", "/api/does-not-exist", 404);

const waitlistEmail = `waitlist-${Date.now()}@example.com`;
await expectStatus("POST /events/:slug/waitlist", "POST", `/api/events/${slug}/waitlist`, [201, 200], {
  body: { email: waitlistEmail },
});
await expectStatus("waitlist duplicate → 409", "POST", `/api/events/${slug}/waitlist`, 409, {
  body: { email: waitlistEmail },
});

// ──────────────────────────────────────────────────── orders / buying ──
setGroup("ORDERS  /api/orders  (guest purchase flow)");

const hold = await call("POST", "/api/orders/hold", {
  body: {
    eventSlug: slug,
    lines: [{ tierId, qty: 2 }],
    holderName: "Live Test Buyer",
    email: "livetest-buyer@example.com",
    phone: "0612345678",
  },
});
const orderId = hold.data?.order?.id;
if (orderId) created.orders.push(orderId);
// A guest order has no session, so the hold hands back an access token the
// buyer carries for everything after. It is returned exactly once, here;
// `?k=` is how their confirmation link holds it.
const orderKey = hold.data?.accessToken;
const k = (t) => (t ? `?k=${encodeURIComponent(t)}` : "");
record("hold issues an order access token", typeof orderKey === "string" && orderKey.length >= 24, orderKey ? "issued" : "MISSING");
record("POST /orders/hold creates PENDING", hold.status === 201 && hold.data?.order?.status === "PENDING", `${hold.status} status=${hold.data?.order?.status}`);
record("hold issues NO tickets before payment", (hold.data?.order?.tickets?.length ?? -1) === 0, `tickets=${hold.data?.order?.tickets?.length}`);

const holdMins = hold.data?.holdUntil ? Math.round((Date.parse(hold.data.holdUntil) - Date.now()) / 60000) : 0;
record("hold lasts 15 minutes", holdMins === 15, `${holdMins} min`);

await expectStatus("hold with bad phone → 400", "POST", "/api/orders/hold", 400, {
  body: { eventSlug: slug, lines: [{ tierId, qty: 1 }], holderName: "Bad Phone", email: "x@example.com", phone: "123" },
});
await expectStatus("hold with absurd qty → 409", "POST", "/api/orders/hold", 409, {
  body: { eventSlug: slug, lines: [{ tierId, qty: 99999 }], holderName: "Too Many", email: "x@example.com", phone: "0612345678" },
});

await expectStatus("GET /orders/:id with the buyer's token", "GET", `/api/orders/${orderId}${k(orderKey)}`, 200);
// The id alone is NOT a credential: cuid() is partly sequential and was
// never meant as a secret, and this response carries email and phone.
await expectStatus("GET /orders/:id without the token → 403", "GET", `/api/orders/${orderId}`, 403);
const pay = await expectStatus("POST /orders/:id/pay", "POST", `/api/orders/${orderId}/pay${k(orderKey)}`, 200);
record("mock mode settles immediately", pay.data?.settled === true, `mode=${pay.data?.mode}`);
await expectStatus("paying twice → 409", "POST", `/api/orders/${orderId}/pay${k(orderKey)}`, 409);

const paid = await call("GET", `/api/orders/${orderId}${k(orderKey)}`);
record("order is PAID with 2 tickets", paid.data?.order?.status === "PAID" && paid.data?.order?.tickets?.length === 2, `status=${paid.data?.order?.status} tickets=${paid.data?.order?.tickets?.length}`);
const ticket = paid.data?.order?.tickets?.[0];
const ticket2 = paid.data?.order?.tickets?.[1];
record("ticket carries a signed QR payload", typeof ticket?.qrPayload === "string" && ticket.qrPayload.startsWith("EVENTICK|"), ticket?.qrPayload?.slice(0, 32));

// Hold release
const rel = await call("POST", "/api/orders/hold", {
  body: { eventSlug: slug, lines: [{ tierId, qty: 1 }], holderName: "Release Me", email: "release@example.com", phone: "0612345678" },
});
if (rel.data?.order?.id) created.orders.push(rel.data.order.id);
const relKey = rel.data?.accessToken;
// Releasing a hold frees the seats to whoever is waiting, so it needs the
// same proof as paying -- otherwise anyone could drop a stranger's cart.
await expectStatus("releasing someone else's hold → 403", "DELETE", `/api/orders/hold/${rel.data?.order?.id}`, 403);
await expectStatus("DELETE /orders/hold/:id releases it", "DELETE", `/api/orders/hold/${rel.data?.order?.id}${k(relKey)}`, 204);
await expectStatus("paying a released hold → 409", "POST", `/api/orders/${rel.data?.order?.id}/pay${k(relKey)}`, 409);

await expectStatus("GET /orders (list) anonymous → 401", "GET", "/api/orders", 401);
await expectStatus("GET /orders (list) as customer", "GET", "/api/orders", 200, { token: tokens.customer });

// ────────────────────────────────────────────────────────────── tickets ──
setGroup("TICKETS  /api/tickets");

// The ticket route serves the SIGNED QR -- the thing the gate scans -- so
// it needs the buyer's token, not just the ticket id.
await expectStatus("GET /tickets/:id with the token", "GET", `/api/tickets/${ticket?.id}${k(orderKey)}`, 200);
await expectStatus("GET /tickets/:id without it → 403", "GET", `/api/tickets/${ticket?.id}`, 403);
await expectStatus("GET /tickets/:id unknown → 404", "GET", "/api/tickets/nope-xyz", 404);
const pdf = await call("GET", `/api/tickets/${ticket?.id}/pdf${k(orderKey)}`);
record("GET /tickets/:id/pdf returns a PDF", pdf.status === 200 && pdf.contentType.includes("application/pdf"), `${pdf.status} ${pdf.contentType}`);

await expectStatus("transfer anonymous → 401", "POST", `/api/tickets/${ticket2?.id}/transfer`, 401, {
  body: { holderName: "New Holder" },
});
await expectStatus("transfer of a guest order by a customer → 403", "POST", `/api/tickets/${ticket2?.id}/transfer`, 403, {
  token: tokens.customer,
  body: { holderName: "New Holder" },
});

// ──────────────────────────────────────────────────────────────── share ──
// Sharing replaced the old transfer, which marked a ticket TRANSFERRED — a
// status the gate refuses — without issuing any replacement, so a transfer
// destroyed the ticket. The full mechanics live in live-share-test.mjs; these
// checks keep the route surface and its guards covered here.
setGroup("SHARE  /api/share");

const share = await call("POST", `/api/share${k(orderKey)}`, { body: { ticketId: ticket2?.id } });
record("POST /share creates a link for a guest ticket", share.status === 201 && typeof share.data?.token === "string", `${share.status}`);
await expectStatus("GET /share/:token is public", "GET", `/api/share/${share.data?.token}`, 200);
await expectStatus("GET /share/:token unknown → 410", "GET", "/api/share/nope-xyz", 410);
await expectStatus("giving away a ticket without the token → 403", "POST", "/api/share", 403, { body: { ticketId: ticket2?.id } });
await expectStatus("a second open link → 409", "POST", `/api/share${k(orderKey)}`, 409, { body: { ticketId: ticket2?.id } });
await expectStatus("claim with a too-short name → 400", "POST", `/api/share/${share.data?.token}/claim`, 400, {
  body: { holderName: "ab" },
});
await expectStatus("DELETE /share/:id revokes it", "DELETE", `/api/share/${share.data?.id}${k(orderKey)}`, 204);
await expectStatus("claiming a revoked link → 410", "POST", `/api/share/${share.data?.token}/claim`, 410, {
  body: { holderName: "Too Late" },
});

// ───────────────────────────────────────────────────────────────── gate ──
setGroup("GATE  /api/gate  (signature enforcement)");

await expectStatus("check-in anonymous → 401", "POST", "/api/gate/check-in", 401, { body: { ref: ticket?.ref } });
await expectStatus("check-in as CUSTOMER → 403", "POST", "/api/gate/check-in", 403, {
  token: tokens.customer,
  body: { ref: ticket?.ref },
});

// The forgery that used to work.
await expectStatus("bare ref via camera → 400 (forgery blocked)", "POST", "/api/gate/check-in", 400, {
  token: tokens.admin,
  body: { ref: ticket?.ref, source: "camera" },
});
await expectStatus("bare ref, source omitted → 400 (strict default)", "POST", "/api/gate/check-in", 400, {
  token: tokens.admin,
  body: { ref: ticket?.ref },
});
await expectStatus("tampered signature → 400", "POST", "/api/gate/check-in", 400, {
  token: tokens.admin,
  body: { ref: `EVENTICK|${ticket?.ref}|${slug}|deadbeefdeadbeef`, source: "camera" },
});

const scan = await call("POST", "/api/gate/check-in", {
  token: tokens.admin,
  body: { ref: ticket?.qrPayload, source: "camera" },
});
record("signed QR via camera admits", scan.status === 200 && scan.data?.result === "ok" && scan.data?.signed === true, `${scan.status} signed=${scan.data?.signed}`);
await expectStatus("re-scanning the same ticket → 409 used", "POST", "/api/gate/check-in", 409, {
  token: tokens.admin,
  body: { ref: ticket?.qrPayload, source: "camera" },
});
const manual = await call("POST", "/api/gate/check-in", {
  token: tokens.admin,
  body: { ref: ticket2?.ref, source: "manual" },
});
record("typed ref by staff admits (unsigned)", manual.status === 200 && manual.data?.signed === false, `${manual.status} signed=${manual.data?.signed}`);

const manifest = await expectStatus("GET /gate/:slug/manifest as admin", "GET", `/api/gate/events/${slug}/manifest`, 200, { token: tokens.admin });
record("manifest excludes already-used tickets", Array.isArray(manifest.data?.refs) && !manifest.data.refs.includes(ticket?.ref), `${manifest.data?.refs?.length ?? 0} valid refs`);
await expectStatus("manifest for another's event → 403", "GET", `/api/gate/events/${slug}/manifest`, 403, { token: tokens.organiser });

// ──────────────────────────────────────────────────────────── organiser ──
setGroup("ORGANISER  /api/organiser  (role boundaries)");

for (const [label, token, want] of [
  ["anonymous", undefined, 401],
  ["CUSTOMER", tokens.customer, 403],
  ["ORGANISER", tokens.organiser, 200],
  ["ADMIN", tokens.admin, 200],
]) {
  await expectStatus(`GET /organiser/events as ${label}`, "GET", "/api/organiser/events", want, { token });
}

await expectStatus("GET /organiser/stats", "GET", "/api/organiser/stats", 200, { token: tokens.admin });
await expectStatus("GET /organiser/orders", "GET", "/api/organiser/orders", 200, { token: tokens.admin });
await expectStatus("GET /organiser/orders/detailed", "GET", "/api/organiser/orders/detailed", 200, { token: tokens.admin });
await expectStatus("GET /organiser/:slug/waitlist", "GET", `/api/organiser/events/${slug}/waitlist`, 200, { token: tokens.admin });
await expectStatus("GET /organiser/:slug/audience", "GET", `/api/organiser/events/${slug}/audience`, 200, { token: tokens.admin });

// Cross-organiser isolation: the demo organiser owns oasis-2026, not mawazine.
await expectStatus("organiser reading another's waitlist → 403", "GET", `/api/organiser/events/${slug}/waitlist`, 403, { token: tokens.organiser });
await expectStatus("organiser editing another's event → 403", "PATCH", `/api/organiser/events/${slug}`, 403, {
  token: tokens.organiser,
  body: { city: "Hacked" },
});
await expectStatus("organiser deleting another's event → 403", "DELETE", `/api/organiser/events/${slug}`, 403, { token: tokens.organiser });

// Create / edit / delete an event as the organiser.
const newSlug = `livetest-event-${Date.now()}`;
const mkEvent = await call("POST", "/api/organiser/events", {
  token: tokens.organiser,
  body: {
    slug: newSlug,
    titleFr: "Événement de test",
    titleAr: "حدث اختباري",
    category: "festivals",
    city: "Casablanca",
    venueFr: "Salle test",
    venueAr: "قاعة اختبار",
    address: "Test, Casablanca",
    start: "2027-09-01T20:00:00",
    end: "2027-09-01T23:59:00",
    doors: "2027-09-01T19:00:00",
    image: "/events/jazz.jpg",
    blurbFr: "Test",
    blurbAr: "اختبار",
    aboutFr: "Test",
    aboutAr: "اختبار",
    ageFr: "Tous publics",
    ageAr: "للجميع",
    tiers: [
      { nameFr: "Standard", nameAr: "عادي", blurbFr: "t", blurbAr: "t", priceCents: 15000, capacity: 50, zoneFr: "A", zoneAr: "A", gateFr: "1", gateAr: "1" },
    ],
  },
});
record("POST /organiser/events creates", mkEvent.status === 201, `${mkEvent.status}`);
if (mkEvent.status === 201) created.events.push(newSlug);

await expectStatus("duplicate slug → 409", "POST", "/api/organiser/events", 409, {
  token: tokens.organiser,
  body: { ...JSON.parse(JSON.stringify(mkEvent.data?.event ? {} : {})), slug: newSlug, titleFr: "Dup", titleAr: "مكرر", category: "festivals", city: "Rabat", venueFr: "v", venueAr: "v", address: "a", start: "2027-09-01T20:00:00", end: "2027-09-01T23:59:00", doors: "2027-09-01T19:00:00", image: "/events/jazz.jpg", blurbFr: "b", blurbAr: "b", aboutFr: "a", aboutAr: "a", ageFr: "x", ageAr: "x", tiers: [{ nameFr: "S", nameAr: "S", blurbFr: "t", blurbAr: "t", priceCents: 1000, capacity: 5, zoneFr: "A", zoneAr: "A", gateFr: "1", gateAr: "1" }] },
});

await expectStatus("PATCH own event (content)", "PATCH", `/api/organiser/events/${newSlug}`, 200, {
  token: tokens.organiser,
  body: { city: "Rabat" },
});
await expectStatus("PATCH visibility (hide)", "PATCH", `/api/organiser/events/${newSlug}/visibility`, 200, {
  token: tokens.organiser,
  body: { hidden: true },
});
const hidden = await call("GET", `/api/events/${newSlug}`);
record("hidden event is gone from the public API", hidden.status === 404, `${hidden.status}`);
await expectStatus("PATCH visibility (restore)", "PATCH", `/api/organiser/events/${newSlug}/visibility`, 200, {
  token: tokens.organiser,
  body: { hidden: false },
});

// Broadcast
await expectStatus("broadcast validation (short subject) → 400", "POST", `/api/organiser/events/${slug}/broadcast`, 400, {
  token: tokens.admin,
  body: { subject: "x", message: "too short" },
});
const bc = await call("POST", `/api/organiser/events/${slug}/broadcast`, {
  token: tokens.admin,
  body: { subject: "Live test broadcast", message: "This is an automated live test message to buyers." },
});
record("broadcast reports recipients honestly", bc.status === 200 && typeof bc.data?.recipients === "number", `${bc.status} recipients=${bc.data?.recipients} sent=${bc.data?.sent}`);

// Ticket admit toggle + refunds
await expectStatus("PATCH ticket status (undo admit)", "PATCH", `/api/organiser/tickets/${ticket?.id}/status`, 200, {
  token: tokens.admin,
  body: { status: "VALID" },
});
const refund = await call("POST", `/api/organiser/orders/${orderId}/refund`, {
  token: tokens.admin,
  body: { amountCents: 10000 },
});
record("partial refund recorded", refund.status === 200 && refund.data?.refundedCents === 10000 && refund.data?.full === false, `${refund.status} refunded=${refund.data?.refundedCents}`);
await expectStatus("over-refund → 400", "POST", `/api/organiser/orders/${orderId}/refund`, 400, {
  token: tokens.admin,
  body: { amountCents: 9_000_000 },
});
const full = await call("POST", `/api/organiser/orders/${orderId}/refund`, { token: tokens.admin, body: {} });
record("full refund voids tickets", full.status === 200 && full.data?.full === true, `${full.status} full=${full.data?.full}`);
const afterRefund = await call("GET", `/api/orders/${orderId}${k(orderKey)}`);
record("order is REFUNDED, tickets CANCELLED", afterRefund.data?.order?.status === "REFUNDED" && afterRefund.data.order.tickets.every((t) => t.status === "CANCELLED"), `status=${afterRefund.data?.order?.status}`);
await expectStatus("refunding again → 409", "POST", `/api/organiser/orders/${orderId}/refund`, 409, { token: tokens.admin, body: {} });

// ──────────────────────────────────────────────────────────────── promo ──
setGroup("PROMO  /api/promo");

await expectStatus("GET /promo anonymous → 401", "GET", "/api/promo", 401);
await expectStatus("GET /promo as customer → 403", "GET", "/api/promo", 403, { token: tokens.customer });
await expectStatus("GET /promo as organiser", "GET", "/api/promo", 200, { token: tokens.organiser });

const code = `LIVETEST${Date.now().toString().slice(-6)}`;
const mkPromo = await call("POST", "/api/promo", {
  token: tokens.admin,
  body: { code, kind: "PERCENT", value: 10, maxUses: 5 },
});
record("POST /promo creates", mkPromo.status === 201, `${mkPromo.status} ${mkPromo.data?.promo?.code ?? ""}`);
if (mkPromo.data?.promo?.id) created.promos.push(mkPromo.data.promo.id);

await expectStatus("PATCH /promo/:id bumps maxUses", "PATCH", `/api/promo/${mkPromo.data?.promo?.id}`, 200, {
  token: tokens.admin,
  body: { maxUses: 55 },
});
await expectStatus("DELETE /promo/:id", "DELETE", `/api/promo/${mkPromo.data?.promo?.id}`, 204, { token: tokens.admin });
if (mkPromo.data?.promo?.id) created.promos.pop();

// ────────────────────────────────────────────────────────────── uploads ──
setGroup("UPLOADS  /api/uploads");

function pngBuffer() {
  const zlib = require("node:zlib");
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.from([0, 255, 0, 0]))), chunk("IEND", Buffer.alloc(0))]);
}
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);

const upForm = new FormData();
upForm.append("file", new Blob([pngBuffer()], { type: "image/png" }), "test.png");
const up = await call("POST", "/api/uploads/image", { token: tokens.organiser, form: upForm });
record("upload a real PNG", up.status === 201 && typeof up.data?.url === "string", `${up.status} ${up.data?.url ?? up.data?.error ?? ""}`);

if (up.data?.url) {
  const served = await fetch(`${API}${up.data.url}`);
  record("uploaded file is served back", served.status === 200, `${served.status} ${served.headers.get("content-type")}`);
}

const evilForm = new FormData();
evilForm.append("file", new Blob([Buffer.from('<?php system($_GET["c"]); ?>')], { type: "image/png" }), "evil.png");
const evil = await call("POST", "/api/uploads/image", { token: tokens.organiser, form: evilForm });
record("script disguised as PNG rejected", evil.status === 415, `${evil.status}`);

const custForm = new FormData();
custForm.append("file", new Blob([pngBuffer()], { type: "image/png" }), "x.png");
await expectStatus("upload as CUSTOMER → 403", "POST", "/api/uploads/image", 403, { token: tokens.customer, form: custForm });

const anonForm = new FormData();
anonForm.append("file", new Blob([pngBuffer()], { type: "image/png" }), "x.png");
await expectStatus("upload anonymous → 401", "POST", "/api/uploads/image", 401, { form: anonForm });

// ───────────────────────────────────────────────────────────── webhooks ──
setGroup("WEBHOOKS  /api/webhooks");

const wh = await call("POST", "/api/webhooks/stripe", { body: { type: "payment_intent.succeeded" } });
record("unsigned webhook is not processed", wh.status === 200 && wh.data?.ignored !== undefined, `${wh.status} ${JSON.stringify(wh.data).slice(0, 60)}`);

// ──────────────────────────────────────────────────────────────── proxy ──
setGroup("PROXY  via Next.js :3100");

for (const [label, path] of [
  ["GET /api/events", "/api/events"],
  ["GET /api/health", "/api/health"],
  ["GET /api/ready", "/api/ready"],
]) {
  await expectStatus(`${label} through proxy`, "GET", path, 200, { base: PROXY });
}
await expectStatus("authenticated call through proxy", "GET", "/api/organiser/stats", 200, { base: PROXY, token: tokens.admin });

for (const route of ["/", "/explorer", "/billets", "/login", "/pro", "/pro/gate", "/aide", "/legal"]) {
  const r = await fetch(`${PROXY}${route}`);
  record(`page ${route}`, r.status === 200, `${r.status}`);
}

// ───────────────────────────────────────────────────────────── cleanup ──
setGroup("CLEANUP");

for (const slugToDelete of created.events) {
  const r = await call("DELETE", `/api/organiser/events/${slugToDelete}`, { token: tokens.organiser });
  record(`deleted test event ${slugToDelete}`, r.status === 204, `${r.status}`);
}
for (const id of created.promos) {
  await call("DELETE", `/api/promo/${id}`, { token: tokens.admin });
}
for (const id of created.orders) {
  await call("DELETE", `/api/organiser/orders/${id}`, { token: tokens.admin });
}
record("test orders removed", true, `${created.orders.length} order(s)`);

// ───────────────────────────────────────────────────────────── summary ──
const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);

console.log(`\n${"─".repeat(62)}`);
console.log(`\x1b[1mTOTAL: ${passed}/${results.length} passed\x1b[0m`);
if (failed.length) {
  console.log(`\n\x1b[31mFailures:\x1b[0m`);
  for (const f of failed) console.log(`  [${f.group}] ${f.label} — ${f.detail}`);
}
console.log(`${"─".repeat(62)}`);
process.exit(failed.length ? 1 : 0);
