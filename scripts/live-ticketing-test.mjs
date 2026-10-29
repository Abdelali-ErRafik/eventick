/**
 * Live test — the four capabilities a real organiser needs in week one.
 *
 * Each one was a hole found by auditing the ticketing product rather than the
 * code:
 *
 *   - The ticket cap was 8 per ORDER, not per buyer. Verified against the
 *     running app: one email took 24 seats in three clicks, which is the
 *     difference between fans and resellers getting a high-demand show.
 *   - EventStatus.CANCELLED existed in the schema and NO route set it, so
 *     calling off a festival meant refunding buyers one order at a time.
 *   - No tier could go on sale later or stop early, so early-bird pricing and
 *     staged releases were inexpressible.
 *   - No way to comp press, sponsors or the guest list except a 100% promo
 *     code, which lands in revenue and commission as a zero-value sale.
 *
 * Plus resale, which is now opt-in per event rather than always on.
 *
 * Run from the backend directory, which has Prisma and the env:
 *   cd backend && npx tsx ../scripts/live-ticketing-test.mjs
 */
import { prisma } from '../backend/src/lib/prisma.js';

const API = 'http://localhost:4100';
const p = prisma;
const mad = (c) => (c / 100).toFixed(2);
let bad = 0;
const say = (ok, claim, detail) => { if (!ok) bad++; console.log(`  ${ok ? 'OK  ' : 'WRONG'} ${claim}${detail ? `  — ${detail}` : ''}`); };

const login = async (e, pw) => (await (await fetch(`${API}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: pw }),
})).json()).token;
const call = async (m, path, { token, body, key } = {}) => {
  const url = key ? `${API}${path}${path.includes('?') ? '&' : '?'}k=${encodeURIComponent(key)}` : `${API}${path}`;
  const r = await fetch(url, {
    method: m,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 200); }
  return { status: r.status, data: d };
};

const admin = await login('admin@eventick.ma', 'eventick-admin-2026');
const orga = await login('organisateur@eventick.ma', 'eventick-orga-2026');
const orgaId = (await call('GET', '/api/auth/me', { token: orga })).data.user.id;
const SUF = Date.now();
const start = new Date(Date.now() + 30 * 86400000);

const mkEvent = async (label, extra = {}, tierExtra = {}) => {
  const e = await p.event.create({
    data: {
      slug: `four-${SUF}-${label}`, organiserId: orgaId, titleFr: `Four ${label}`, titleAr: 'د',
      category: 'concert', city: 'Casablanca', venueFr: 'V', venueAr: 'ق', address: 'A',
      startAt: start, endAt: start, doorsAt: start, image: 'x.jpg',
      blurbFr: 'b', blurbAr: 'ب', aboutFr: 'a', aboutAr: 'أ', ageFr: '+18', ageAr: '+18',
      status: 'PUBLISHED', ...extra,
      tiers: { create: { nameFr: 'P', nameAr: 'م', blurbFr: 'b', blurbAr: 'ب', priceCents: 50000, capacity: 30, zoneFr: 'Z', zoneAr: 'ز', gateFr: 'G', gateAr: 'ج', ...tierExtra } },
    }, include: { tiers: true },
  });
  return { event: e, tier: e.tiers[0] };
};
const hold = (ev, tier, qty, email, token) => call('POST', '/api/orders/hold', {
  token, body: { eventSlug: ev.slug, lines: [{ tierId: tier.id, qty }], ...(email ? { email } : {}) },
});

// ── 1. Per-buyer limit ──
console.log('\n1. PER-BUYER LIMIT (the 24-seat hole)');
{
  const { event, tier } = await mkEvent('limit', { maxPerBuyer: 10 });
  const buyer = `four-${SUF}-buyer@eventick.ma`;
  let got = 0;
  for (let i = 1; i <= 3; i++) {
    const h = await hold(event, tier, 8, buyer);
    if (h.status === 201) {
      await call('POST', `/api/orders/${h.data.order.id}/pay`, { key: h.data.accessToken, body: { holderName: 'Four Buyer', email: buyer, phone: '0612345678' } });
      got += 8;
    } else {
      say(true, `order ${i} refused`, h.data.error?.slice(0, 60));
      break;
    }
  }
  say(got <= 10, `one buyer got ${got} seats with a limit of 10`, got > 10 ? 'LIMIT NOT ENFORCED' : 'limit held');

  // Case-insensitivity: the same person with different capitalisation.
  const upper = await hold(event, tier, 4, buyer.toUpperCase());
  say(upper.status === 409, 'the same email in CAPITALS is still the same buyer', `${upper.status}`);

  // A different buyer is unaffected.
  const other = await hold(event, tier, 4, `four-${SUF}-other@eventick.ma`);
  say(other.status === 201, 'a different buyer can still buy');

  // 0 = unlimited.
  const { event: unl, tier: unlTier } = await mkEvent('unlimited', { maxPerBuyer: 0 });
  const u1 = await hold(unl, unlTier, 8, buyer);
  await call('POST', `/api/orders/${u1.data.order.id}/pay`, { key: u1.data.accessToken, body: { holderName: 'Four Buyer', email: buyer, phone: '0612345678' } });
  const u2 = await hold(unl, unlTier, 8, buyer);
  say(u2.status === 201, 'maxPerBuyer 0 means unlimited', `${u2.status}`);
}

// ── 2. Sales windows ──
console.log('\n2. SALES WINDOWS');
{
  const future = new Date(Date.now() + 7 * 86400000);
  const { event: soon, tier: soonTier } = await mkEvent('notyet', {}, { salesStartAt: future });
  const early = await hold(soon, soonTier, 1, `four-${SUF}-w@eventick.ma`);
  say(early.status === 409 && /open on/i.test(early.data.error ?? ''), 'a tier not yet on sale refuses a hold', early.data.error?.slice(0, 50));

  const past = new Date(Date.now() - 86400000);
  const { event: over, tier: overTier } = await mkEvent('closed', {}, { salesEndAt: past });
  const late = await hold(over, overTier, 1, `four-${SUF}-w@eventick.ma`);
  say(late.status === 409 && /closed/i.test(late.data.error ?? ''), 'a closed tier refuses a hold', late.data.error?.slice(0, 40));

  const { event: open, tier: openTier } = await mkEvent('open', {}, { salesStartAt: past, salesEndAt: future });
  const now = await hold(open, openTier, 1, `four-${SUF}-w@eventick.ma`);
  say(now.status === 201, 'a tier inside its window sells normally');

  // Inverted window refused at save time.
  const bad = await call('PATCH', `/api/organiser/tiers/${openTier.id}`, {
    token: orga, body: { salesStartAt: future.toISOString(), salesEndAt: past.toISOString() },
  });
  say(bad.status === 400, 'an inverted window is refused when saving', `${bad.status}`);

  // One-field patch is checked against stored state.
  const halfBad = await call('PATCH', `/api/organiser/tiers/${openTier.id}`, {
    token: orga, body: { salesEndAt: new Date(Date.now() - 10 * 86400000).toISOString() },
  });
  say(halfBad.status === 400, 'patching ONE field cannot invert an existing window', `${halfBad.status}`);
}

// ── 3. Comp tickets ──
console.log('\n3. COMP TICKETS');
let compEvent;
{
  const { event, tier } = await mkEvent('comps');
  compEvent = event;
  const before = await call('GET', `/api/organiser/stats?organiserId=${orgaId}`, { token: admin });

  const issued = await call('POST', `/api/organiser/events/${event.slug}/invitations`, {
    token: orga,
    body: { tierId: tier.id, guests: [
      { guestName: 'Journaliste Presse', guestEmail: `four-${SUF}-press@eventick.ma`, note: 'presse' },
      { guestName: 'Invité Artiste' },
    ] },
  });
  say(issued.status === 201 && issued.data.issued.length === 2, 'two comps are issued', `${issued.status}`);
  say(issued.data.issued?.[0]?.ref?.startsWith('ET-'), 'each gets a real ticket reference', issued.data.issued?.[0]?.ref);

  const kinds = await p.ticket.findMany({ where: { tier: { eventId: event.id } }, select: { kind: true, holderName: true } });
  say(kinds.every((k) => k.kind === 'COMP'), 'they are marked COMP, not SOLD');
  say(kinds.some((k) => k.holderName === 'Journaliste Presse'), "the GUEST's name is on the ticket, not the issuer's");

  // THE property: a comp is not revenue.
  const after = await call('GET', `/api/organiser/stats?organiserId=${orgaId}`, { token: admin });
  say(after.data.gmvCents === before.data.gmvCents, 'revenue did NOT move', `${mad(before.data.gmvCents)} -> ${mad(after.data.gmvCents)}`);
  say(after.data.feeCents === before.data.feeCents, 'commission did NOT move', `${mad(before.data.feeCents)} -> ${mad(after.data.feeCents)}`);
  say(after.data.orders === before.data.orders, 'the order count did NOT move', `${before.data.orders} -> ${after.data.orders}`);

  // Comps consume capacity.
  const remaining = (await call('GET', `/api/events/${event.slug}`)).data.event.tiers[0].remaining;
  say(remaining === 28, 'a comp takes a real seat (30 - 2)', `${remaining}`);

  // Guest list, and revoking.
  const list = await call('GET', `/api/organiser/events/${event.slug}/invitations`, { token: orga });
  say(list.data.invitations.length === 2, 'the guest list reads back', `${list.data.invitations.length}`);
  const revoke = await call('DELETE', `/api/organiser/invitations/${list.data.invitations[0].id}`, { token: orga });
  say(revoke.status === 200, 'a comp can be revoked');
  const after2 = await call('GET', `/api/organiser/events/${event.slug}/invitations`, { token: orga });
  say(after2.data.invitations.length === 2 && after2.data.invitations.some((i) => i.revoked), 'the guest stays on the list, marked revoked');

  // Capacity respected.
  const over = await call('POST', `/api/organiser/events/${event.slug}/invitations`, {
    token: orga, body: { tierId: tier.id, guests: Array.from({ length: 40 }, (_, i) => ({ guestName: `Guest ${i}` })) },
  });
  say(over.status === 409, 'comping beyond capacity is refused', `${over.status}`);
}

// ── 4. Event cancellation ──
console.log('\n4. EVENT CANCELLATION + MASS REFUND');
{
  const { event, tier } = await mkEvent('cancel');
  // Three buyers.
  for (let i = 1; i <= 3; i++) {
    const h = await hold(event, tier, 2, `four-${SUF}-c${i}@eventick.ma`);
    await call('POST', `/api/orders/${h.data.order.id}/pay`, { key: h.data.accessToken, body: { holderName: `Buyer ${i}`, email: `four-${SUF}-c${i}@eventick.ma`, phone: '0612345678' } });
  }
  // Plus a comp, which was never paid for.
  await call('POST', `/api/organiser/events/${event.slug}/invitations`, { token: orga, body: { tierId: tier.id, guests: [{ guestName: 'Comp Guest' }] } });
  // Plus a live hold mid-checkout.
  await hold(event, tier, 1, `four-${SUF}-pending@eventick.ma`);

  const noReason = await call('POST', `/api/organiser/events/${event.slug}/cancel`, { token: orga, body: { reason: '' } });
  say(noReason.status === 400, 'a reason is required', `${noReason.status}`);

  const result = await call('POST', `/api/organiser/events/${event.slug}/cancel`, {
    token: orga, body: { reason: 'Artiste malade — report impossible', notify: false },
  });
  say(result.status === 200, 'the event is cancelled', `${result.status} ${result.data.error ?? ''}`);
  say(result.data.refunded === 3, 'all three buyers refunded in one action', `${result.data.refunded}`);
  say(result.data.refundedCents === 300000, 'the full amount went back', mad(result.data.refundedCents ?? 0));
  say(result.data.failed?.length === 0, 'no order failed', JSON.stringify(result.data.failed));

  const ev = await p.event.findUnique({ where: { id: event.id }, select: { status: true, cancelReason: true, cancelledAt: true } });
  say(ev.status === 'CANCELLED', 'the status is CANCELLED');
  say(ev.cancelReason?.includes('malade'), 'the REASON is stored for the buyers who ask', ev.cancelReason?.slice(0, 30));

  const live = await p.ticket.count({ where: { tier: { eventId: event.id }, status: { in: ['VALID', 'USED'] } } });
  say(live === 0, 'every ticket is void, including the comp', `${live} still live`);

  const pending = await p.order.count({ where: { eventId: event.id, status: 'PENDING' } });
  say(pending === 0, 'the live hold was released');

  const gone = await call('GET', `/api/events/${event.slug}`);
  say(gone.status === 404, 'the event is off the public catalogue', `${gone.status}`);

  const twice = await call('POST', `/api/organiser/events/${event.slug}/cancel`, { token: orga, body: { reason: 'again, please' } });
  say(twice.status === 409, 'cancelling twice is refused', `${twice.status}`);

  const j = await call('GET', '/api/platform/audit?action=event.cancelled&limit=5', { token: admin });
  say(j.data.events?.length > 0, 'the cancellation is in the journal');
}

// ── 5. Resale is opt-in ──
console.log('\n5. RESALE IS OPT-IN');
{
  const { event, tier } = await mkEvent('resale');
  const cust = await login('client@eventick.ma', 'eventick-client-2026');
  const h = await hold(event, tier, 1, null, cust);
  await call('POST', `/api/orders/${h.data.order.id}/pay`, { token: cust, body: { holderName: 'Karim Client', email: 'client@eventick.ma', phone: '0612345678' } });
  const t = await p.ticket.findFirst({ where: { orderId: h.data.order.id }, select: { id: true } });

  const off = await call('POST', '/api/resale/listings', { token: cust, body: { ticketId: t.id } });
  say(off.status === 409 && /not enabled/i.test(off.data.error ?? ''), 'resale is refused by default', off.data.error?.slice(0, 50));

  await call('PATCH', `/api/organiser/events/${event.slug}/settings`, { token: orga, body: { allowResale: true } });
  const on = await call('POST', '/api/resale/listings', { token: cust, body: { ticketId: t.id } });
  say(on.status === 201, 'and works once the organiser enables it', `${on.status}`);
}

// ── Cleanup ──
const evs = await p.event.findMany({ where: { slug: { startsWith: `four-${SUF}` } }, select: { id: true } });
for (const e of evs) {
  const tiers = (await p.ticketTier.findMany({ where: { eventId: e.id }, select: { id: true } })).map((t) => t.id);
  await p.invitation.deleteMany({ where: { eventId: e.id } });
  await p.resaleListing.deleteMany({ where: { ticket: { tierId: { in: tiers } } } });
  await p.ticketShare.deleteMany({ where: { ticket: { tierId: { in: tiers } } } });
  await p.ticket.deleteMany({ where: { tierId: { in: tiers } } });
  await p.orderLine.deleteMany({ where: { tierId: { in: tiers } } });
  await p.waitlistEntry.deleteMany({ where: { eventId: e.id } });
  await p.order.deleteMany({ where: { eventId: e.id } });
  await p.ticketTier.deleteMany({ where: { eventId: e.id } });
  await p.event.delete({ where: { id: e.id } });
}
await p.auditEvent.deleteMany({ where: { subjectLabel: { startsWith: `four-${SUF}` } } });
console.log(`\ncleaned ${evs.length} probe event(s)`);
console.log(bad === 0 ? '\nALL FOUR FEATURES WORK' : `\n*** ${bad} PROBLEM(S) ***`);
await p.$disconnect();
process.exit(bad === 0 ? 0 : 1);
