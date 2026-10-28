/**
 * Guest-order authorization — the boundary around a ticket nobody owns.
 *
 * A guest order has `customerId: null`, so there is no user to compare a
 * request against. Three route files answered that by skipping the ownership
 * check entirely:
 *
 *     const isGuestOrder = ticket.order.customerId === null;
 *     if (!isGuestOrder && ticket.order.customerId !== userId) throw 403;
 *
 * which means anyone holding a guest ticket's id could cancel it, rename its
 * holder, exchange it, list it for resale, or give it away. "No account" had
 * been implemented as "no check", and those are different things.
 *
 * The fix is an unguessable token on the order — the same pattern this
 * codebase already uses for TicketShare.token — handed to the buyer as part
 * of their confirmation link. This file pins down the resulting boundary:
 *
 *   1. A guest can still do everything with their own token. Guest checkout
 *      must not become login-only; that is the feature, not the bug.
 *   2. A stranger holding only the id can read nothing sensitive and write
 *      nothing at all.
 *   3. A registered buyer's tickets stay reachable only by that buyer, which
 *      already worked and must keep working.
 *
 * Written to FAIL against the pre-fix code on the write paths, and to pass
 * after. Creates its own orders and removes them at the end.
 */

const API = process.env.API ?? "http://localhost:4100";

const ACCOUNTS = {
  customer: { email: "client@eventick.ma", password: "eventick-client-2026" },
  organiser: { email: "organisateur@eventick.ma", password: "eventick-orga-2026" },
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

async function call(method, path, { token, orderToken, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  // The guest credential. Separate from `token` on purpose — a guest has no
  // bearer token at all, and mixing the two into one param is how a test
  // call ends up silently sending neither.
  if (orderToken) headers["X-Order-Token"] = orderToken;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, data };
}

const login = async (account) => {
  const res = await call("POST", "/api/auth/login", { body: account });
  if (res.status !== 200) throw new Error(`login ${account.email} -> ${res.status}`);
  return res.data.token;
};

/** `k` is the order's access token; a guest request carries it as a query arg. */
const k = (token) => (token ? `?k=${encodeURIComponent(token)}` : "");

const tokens = {
  customer: await login(ACCOUNTS.customer),
  organiser: await login(ACCOUNTS.organiser),
};

// ─────────────────────────────────────────────── fixtures ──

const cleanup = { orders: [] };

const events = await call("GET", "/api/events");
const event = events.data.events.find((e) => (e.tiers?.length ?? 0) >= 2) ?? events.data.events[0];
const detail = await call("GET", `/api/events/${event.slug}`);
const tiers = detail.data.event.tiers;

/** Buys `qty` tickets. With no token the order is a guest order. */
async function buy(qty, token) {
  const hold = await call("POST", "/api/orders/hold", {
    token,
    body: { eventSlug: event.slug, lines: [{ tierId: tiers[0].id, qty }] },
  });
  if (hold.status !== 201 && hold.status !== 200) {
    throw new Error(`hold failed: ${hold.status} ${JSON.stringify(hold.data)}`);
  }
  const order = hold.data.order;
  cleanup.orders.push(order.id);
  // The hold response is the one place the credential is handed over, and a
  // real client carries it into /pay from there — exactly as the SPA does.
  const accessToken = hold.data.accessToken ?? null;
  const pay = await call("POST", `/api/orders/${order.id}/pay${k(accessToken)}`, {
    token,
    body: { holderName: "Test Acheteur", email: "guest-authz@example.com", phone: "0612345678" },
  });
  if (pay.status !== 200) throw new Error(`pay failed: ${pay.status} ${JSON.stringify(pay.data)}`);
  return { id: order.id, accessToken };
}

// ──────────────────────────────── the guest keeps their own access ──

setGroup("GUEST  can still do everything with their own link");

const mine = await buy(3);
record("a guest can buy with no account at all", Boolean(mine.id), mine.id?.slice(0, 10) + "…");
record("the order carries an access token for the buyer", Boolean(mine.accessToken), mine.accessToken ? "issued" : "MISSING");

const readMine = await call("GET", `/api/orders/${mine.id}${k(mine.accessToken)}`);
record("reads their own order with the token", readMine.status === 200, `${readMine.status}`);
record("sees their own email on it", readMine.data?.order?.email === "guest-authz@example.com", readMine.data?.order?.email ?? "(hidden)");

const myTickets = readMine.data?.order?.tickets ?? [];
record("their tickets were issued", myTickets.length === 3, `${myTickets.length}`);

const t = myTickets[0];
const qr = await call("GET", `/api/tickets/${t?.id}${k(mine.accessToken)}`);
record("opens their own ticket/QR with the token", qr.status === 200, `${qr.status}`);

const opts = await call("GET", `/api/tickets/${t?.id}/options${k(mine.accessToken)}`);
record("reads what they may do with it", opts.status === 200, `${opts.status}`);

const rename = await call("PATCH", `/api/tickets/${t?.id}/holder${k(mine.accessToken)}`, {
  body: { holderName: "Nom Corrigé" },
});
record("renames the holder on their own ticket", rename.status === 200, `${rename.status}`);

const own = await call("POST", `/api/tickets/${myTickets[1]?.id}/cancel${k(mine.accessToken)}`);
record("cancels their own ticket", own.status === 200, `${own.status}`);

// POST /share and DELETE /share/:id take the ticket id in the BODY (or a
// share id that is not a ticket id at all), so the frontend cannot resolve
// either request from the URL alone — it has to attach the token itself.
// Regression coverage for exactly that: the frontend once silently dropped
// it here while every /tickets/* and /orders/* call kept working, so this
// was the one action in the manage panel a guest buyer could not use.
const shareOf = await call("POST", "/api/share", {
  orderToken: mine.accessToken,
  body: { ticketId: myTickets[2]?.id },
});
record("creates a share link for their own ticket", shareOf.status === 201, `${shareOf.status}`);
if (shareOf.status === 201) {
  const revoked = await call("DELETE", `/api/share/${shareOf.data?.id}`, { orderToken: mine.accessToken });
  record("revokes their own share link", revoked.status === 204, `${revoked.status}`);
}

// ──────────────────────────────────── a stranger is locked out ──

setGroup("STRANGER  holds the id, not the token");

const victim = await buy(2);

const readNoToken = await call("GET", `/api/orders/${victim.id}`);
record("cannot read the order without the token", readNoToken.status === 403, `${readNoToken.status}`);

const readBadToken = await call("GET", `/api/orders/${victim.id}?k=not-the-real-token`);
record("a wrong token is refused", readBadToken.status === 403, `${readBadToken.status}`);

// Fetch the real ticket ids through the legitimate link, to attack them.
const victimRead = await call("GET", `/api/orders/${victim.id}${k(victim.accessToken)}`);
const vTickets = victimRead.data?.order?.tickets ?? [];
const v1 = vTickets[0];
// v2 is used below to confirm nothing the attacker tried took effect.
record("(setup) the victim's own link still works", victimRead.status === 200, `${victimRead.status}`);

// Reads
const atkQr = await call("GET", `/api/tickets/${v1?.id}`);
record("cannot open the victim's ticket/QR", atkQr.status === 403, `${atkQr.status}`);

const atkOpts = await call("GET", `/api/tickets/${v1?.id}/options`);
record("cannot read the victim's ticket options", atkOpts.status === 403, `${atkOpts.status}`);

// Writes — these are the ones that were open.
const atkRename = await call("PATCH", `/api/tickets/${v1?.id}/holder`, { body: { holderName: "Pirate" } });
record("cannot RENAME the victim's ticket holder", atkRename.status === 403, `${atkRename.status}`);

const atkCancel = await call("POST", `/api/tickets/${v1?.id}/cancel`);
record("cannot CANCEL the victim's ticket", atkCancel.status === 403, `${atkCancel.status}`);

const atkExchange = await call("POST", `/api/tickets/${v1?.id}/exchange`, { body: { tierId: tiers[0].id } });
record("cannot EXCHANGE the victim's ticket", atkExchange.status === 403, `${atkExchange.status}`);

// resale and share take the ticket in the BODY, and carry the same copied
// guest bypass as tickets.ts — so they need the same boundary.
const atkResale = await call("POST", "/api/resale/listings", {
  body: { ticketId: v1?.id, priceCents: tiers[0].priceCents },
});
record("cannot LIST the victim's ticket for resale", atkResale.status === 403, `${atkResale.status}`);

const atkShare = await call("POST", "/api/share", { body: { ticketId: v1?.id } });
record("cannot GIVE AWAY the victim's ticket", atkShare.status === 403, `${atkShare.status}`);

// Nothing above may have taken effect.
const after = await call("GET", `/api/orders/${victim.id}${k(victim.accessToken)}`);
const stillValid = (after.data?.order?.tickets ?? []).filter((x) => x.status === "VALID").length;
record("the victim's tickets are all still VALID", stillValid === 2, `${stillValid}/2 valid`);
record(
  "the holder name was not changed",
  (after.data?.order?.tickets ?? []).every((x) => x.holderName !== "Pirate"),
  (after.data?.order?.tickets ?? [])[0]?.holderName,
);

// ────────────────────────── a registered buyer is unaffected ──

setGroup("REGISTERED  owner-only, as before");

const reg = await buy(1, tokens.customer);
const regRead = await call("GET", `/api/orders/${reg.id}`, { token: tokens.customer });
record("the owner reads their own order", regRead.status === 200, `${regRead.status}`);
const regTicket = regRead.data?.order?.tickets?.[0];

const regRename = await call("PATCH", `/api/tickets/${regTicket?.id}/holder`, { body: { holderName: "Pirate" } });
record("an anonymous stranger cannot rename it", regRename.status === 403, `${regRename.status}`);

const regCancel = await call("POST", `/api/tickets/${regTicket?.id}/cancel`);
record("an anonymous stranger cannot cancel it", regCancel.status === 403, `${regCancel.status}`);

const regOther = await call("POST", `/api/tickets/${regTicket?.id}/cancel`, { token: tokens.organiser });
record("another LOGGED-IN user cannot cancel it", regOther.status === 403, `${regOther.status}`);

// A token is scoped to its own order, so one guest's link must not open
// anyone else's order.
const regCross = await call("GET", `/api/orders/${reg.id}${k(mine.accessToken)}`);
record("a guest access token from another order does not unlock it", regCross.status === 403, `${regCross.status}`);

// ───────────────────────────────────────── PII on the public read ──

setGroup("PII  what a link-holder is shown");

const pii = await call("GET", `/api/orders/${mine.id}${k(mine.accessToken)}`);
const body = pii.data?.order ?? {};
record("the buyer still sees what they need (status, tickets)", Boolean(body.status) && Array.isArray(body.tickets), body.status);
record("card PAN is never exposed", !("cardNumber" in body) && !("pan" in body), "absent");

// ──────────────────────────────────────────────────── cleanup ──

setGroup("CLEANUP");

// Admin holds scope.any, so it can remove an order on any organiser's
// event -- the organiser token only reaches its own, which is why this
// used to come back 403 and leak a row per run.
const adminToken = await login({ email: "admin@eventick.ma", password: "eventick-admin-2026" });
let leaked = 0;
for (const id of cleanup.orders) {
  const r = await call("DELETE", `/api/organiser/orders/${id}`, { token: adminToken });
  const gone = [200, 204, 404].includes(r.status);
  if (!gone) leaked++;
  record(`removed test order ${id.slice(0, 8)}…`, gone, `${r.status}`);
}
if (leaked) console.log(`  [33m${leaked} order(s) left behind[0m`);

// ───────────────────────────────────────────────────── summary ──

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass);
console.log("\n──────────────────────────────────────────────────────────────");
console.log(`\x1b[1mTOTAL: ${passed}/${results.length} passed\x1b[0m`);
if (failed.length) {
  console.log("\n\x1b[31mFailures:\x1b[0m");
  for (const f of failed) console.log(`  [${f.group}] ${f.label} — ${f.detail}`);
}
console.log("──────────────────────────────────────────────────────────────");
process.exit(failed.length ? 1 : 0);
