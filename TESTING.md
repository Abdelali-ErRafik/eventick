# Eventick — Test Plan Guide

How to verify Eventick is working, at three levels: automated unit tests, automated live-API/live-frontend checks, and a manual walkthrough of the real user flows. Run them in that order — each layer catches different bugs, and the manual walkthrough is the only one that sees styling/UX, not just status codes.

## 0. Prerequisites

```bash
# One-time setup
cd backend && npm install && npx prisma migrate dev && npm run seed
cd ../frontend && npm install
```

Seeding creates three demo accounts (also usable for the manual walkthrough below):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@eventick.ma` | `eventick-admin-2026` |
| Organiser | `organisateur@eventick.ma` | `eventick-orga-2026` |
| Customer | `client@eventick.ma` | `eventick-client-2026` |

Start both servers before running any live or manual test:

```bash
cd backend && npm run dev     # http://localhost:<BACKEND_PORT> (see backend/.env)
cd frontend && npm run dev    # http://localhost:3100
```

---

## 1. Automated unit tests (backend domain logic)

No servers required — these test pure functions in isolation.

```bash
cd backend && npm test
```

Covers: `src/domain/__tests__/` (inventory math, promo/pricing quotes), `src/lib/__tests__/` (JWT secret handling, refund guard rules, ticket QR signature). Run this first — if domain logic is broken, every layer above it will fail too, and this layer is fastest to debug.

**Pass criteria:** all suites green, no skipped tests without a documented reason.

---

## 2. Live API tests (backend, real HTTP + real DB)

Requires the backend dev server running. These hit real routes against a real (test) database — not mocks — so they catch wiring bugs unit tests can't see: auth middleware, Prisma queries, route registration, HTTP status codes.

```bash
cd backend && npm run test:live            # core flows: auth, catalog, orders, tickets, gate, organiser CRUD
cd backend && npm run test:live:coverage   # coverage-focused pass — less-common branches/edge cases
cd backend && npm run test:live:share      # ticket-transfer / claim-share flow specifically
```

Key things these scripts assert (confirm these stay true as the suite grows):

- Anonymous requests to `/organiser/*` → `401`.
- A `CUSTOMER` token hitting `/organiser/*` or `/gate/check-in` → `403` (role gating actually works server-side, not just hidden in the UI).
- Checkout hold → pay → ticket issuance round-trip produces a real `Order`/`Ticket` row.
- Refund rules: full refund works once, a second refund on the same order → `409`; a negative refund amount → `400`.
- Gate check-in: a valid ref is admitted once; scanning the same ticket again → `409`; a bare/malformed code → `400`.
- Every live-API run cleans up the test events/orders it created (the suite reports a 0/clean count at the end — confirm it, a non-zero leftover means a future run will see stale data).

**Pass criteria:** every script reports `N/N passed` with zero failures and zero leftover test data.

---

## 3. Live frontend tests (build-level correctness)

Requires the frontend dev server running.

```bash
cd frontend && npm test
```

This is a Node script (`scripts/live-frontend-test.mjs`), not a browser test runner — it drives the real API the same way the UI does and checks that every screen's data contract still holds (e.g., "Orders screen reads `data.orders`", "Offers screen reads `data.promos`"), plus the same role-gating checks from layer 2 exercised through the paths the UI actually calls.

**Pass criteria:** reported total passes with 0 failures (currently tracks to 105/105 — if that number drops, something regressed; if it only grows, that's expected as features are added).

---

## 4. Typecheck + build (catches what tests don't)

Run after any code change, before committing:

```bash
cd backend && npm run typecheck
cd frontend && npx tsc --noEmit
cd frontend && npm run build
```

The build step matters even though this is a JS/JSX codebase — Next.js's build does a real TypeScript pass over `.tsx` entry files and will catch JSX syntax errors that `tsc --noEmit` alone sometimes misses (a bad comment placement, a stray sibling element). After building, grep the compiled CSS for any Tailwind utility class you just introduced — a typo'd class name fails silently (renders as no style, not an error):

```bash
grep -o 'your-new-class' frontend/.next/static/chunks/*.css
```

**Pass criteria:** zero TypeScript errors, build completes, the new utility class is actually present in compiled output.

---

## 5. Manual walkthrough (the layer automation can't cover)

Do this after every UI/UX change — automated tests check status codes and data shapes, not whether something renders correctly, is reachable by keyboard, or looks right in both themes and both text directions.

### 5.1 Buyer flow (as `client@eventick.ma`, or anonymous where noted)

1. `/` — hero loads, search form works, category rail and "this weekend" grid are populated (not empty skeletons stuck mid-load).
2. `/explorer` — filter by category, city, date range; results update; clearing filters restores the full list.
3 Open any event → `/evenements/:slug` — ticket tiers show live remaining counts; quantity steppers respect per-tier and per-order (8) limits; "choose tickets" CTA scrolls to the tier list.
4. Pick a tier, click through to checkout (`/paiement`) — the 3-step progress indicator reflects the real step; a seat hold countdown is visible and counts down.
5. Pay with the demo card `4242 4242 4242 4242`, any future expiry/CVC, OTP `482913` → lands on `/confirmation/:orderId` with a real order reference.
6. `/billets` — the new ticket appears under "active"; "show pass" opens `/billet/:ticketId` with a scannable QR.
7. From a ticket detail page, test "transfer" (generates a claim link) and open that link as a signed-out session at `/billet-offert/:token` — claim flow completes and the ticket shows for the new holder.
8. Sold-out event (if one exists in seed data) — waitlist email form appears instead of the quantity stepper, and submits without error.

### 5.2 Organiser / dashboard flow (as `organisateur@eventick.ma`)

9. `/organiser` — create a new event end-to-end (title FR+AR, city, tiers, image) and confirm it appears in `/pro/events`.
10. `/pro` (Overview) — stat cards populate, "live" badge pulses briefly after a real sale or check-in happens elsewhere.
11. `/pro/events` — edit an event's title/city; duplicate one; toggle hidden/public and confirm the public event page respects it; export guest list CSV and open the file.
12. `/pro/placements` — switch events via the searchable event picker; add/edit/delete a zone; confirm a zone with sales can't be deleted and capacity can't drop below sold count.
13. `/pro/orders` — search/filter by event and status; admit a ticket at the desk and undo it; issue a partial refund, then a full refund (second refund attempt should be rejected); cancel an order; export CSV.
14. `/pro/gate` — scan mode vs. manual entry toggle; check in a valid ticket (success verdict); re-scan the same ticket (duplicate verdict); download an offline manifest, disconnect network (devtools offline mode), check in a ticket from the manifest, reconnect, and confirm the queued scan syncs.
15. `/pro/finance` — plan selector changes the computed fee; per-event revenue cards match what Orders shows for that event.
16. `/pro/offers` — create a promo code, bump its usage cap, delete it; confirm a waitlist entry appears after step 8 above and shows the right status/expiry.

### 5.3 Access control (confirm gating isn't just client-side)

17. Sign out, try to navigate directly to `/pro` or `/organiser` by URL — redirected to `/login`, not shown a broken dashboard.
18. Sign in as `client@eventick.ma` (a `CUSTOMER`), try the same `/pro` URL — blocked, not just hidden-but-reachable.

### 5.4 Cross-cutting checks (theme, language, responsive)

19. Toggle dark/light theme from both the public header's account menu and the dashboard topbar's account menu — every screen you touched above should have correct contrast in both themes (no light card floating in a dark layout, no dark text on a dark background).
20. Switch locale to Arabic — layout mirrors to RTL correctly (sidebar on the right, icons/chevrons flipped, text aligned right); switch to English and French and spot-check the same screens for missing translation keys (a raw key name like `t.someKey` showing literally means a locale is missing it).
21. Resize to a phone width (or use devtools device mode) for: the public header's mobile drawer, the dashboard sidebar's mobile drawer, and at least one card-grid screen (Placements/Orders/Events) — grids reflow to a single column, nothing overflows horizontally.

**Pass criteria for section 5:** every numbered step completes without a console error, a stuck loading state, or a visibly broken layout, in at least one light-mode and one dark-mode pass.

---

## When something fails

- A unit test failure (layer 1) → the bug is in domain logic; fix it there, not by patching the route.
- A live-API failure (layer 2) → check auth middleware, route registration, or a Prisma query — the domain logic is probably fine if layer 1 passed.
- A live-frontend failure (layer 3) → almost always a data-contract mismatch: a screen reading `data.foo` when the API now returns `data.bar`.
- A manual-only failure (layer 5) → styling/UX regression; none of the automated layers will have caught it, which is exactly why this layer exists.
