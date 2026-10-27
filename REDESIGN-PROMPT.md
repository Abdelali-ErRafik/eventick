# Prompt: redesign the Eventick UI from scratch

Paste everything below the line into a fresh agent session opened at the
repository root (`C:\Users\abdel\OneDrive\Desktop\Storeino\Eventick`).

---

## What you are doing

Eventick is a working Moroccan event-ticketing platform. The backend is solid
and fully tested; the **visual design is not**. It was built screen-by-screen
while features were being added, so it reads as a sequence of forms and tables
rather than a designed product. Your job is to redesign the entire customer-
facing and organiser-facing UI from first principles.

This is a **redesign, not a rewrite**. Every screen must keep doing exactly
what it does today. You are changing how it looks and how it feels to move
through, not what it can do.

Work through the repo as it is. Do not trust this document over the code: where
they disagree, the code is right and this document is stale. Verify before you
act.

## First, understand what exists

Before designing anything, do this and report what you found:

1. Read `frontend/src/app/styles.css` — the full token system, light and dark.
2. Read every screen in `frontend/src/screens/` and `frontend/src/screens/pro/`.
3. Read `frontend/src/components/` — `Shell.jsx`, `EventCard.jsx`,
   `TicketPass.jsx`, `QrMark.jsx`, `Protected.jsx`.
4. Read `frontend/src/screens/pro/ui.jsx` — the existing primitive set.
5. Open `C:\Users\abdel\Downloads\eventick.pdf`. This is the **brand charte**.
   It is authoritative on colour, type and tone. The tokens in `styles.css`
   were derived from it.
6. Run the app and click through every route as each of the three roles.

Then tell me, in your own words and before writing any code:

- What is actually wrong with the current design? Be specific and concrete —
  name screens and name the problem. "It looks dated" is not useful.
- Which screens are worst, and why those first?
- What do you propose instead, as a design direction?

**Stop there and wait for my answer.** Do not start implementing. If your
diagnosis is wrong, everything built on it is wasted.

## The brand is fixed. The design is not.

From `eventick.pdf` and `styles.css`, these do not change:

| Token | Light | Dark | Role |
|---|---|---|---|
| Lagon | `#0B7A75` | `#3FD0C6` | primary |
| Safran | `#FFB400` | `#FFB400` | accent, unchanged by design |
| Encre | `#14172F` | `#E8ECF5` | text |
| Corail | `#D6373D` | `#FF7B80` | destructive |
| Brume | `#DDF2EF` | `#16302E` | tint |
| Papier | `#F4F6FA` | `#0C0E1F` | background |

Fonts: **Bricolage Grotesque** (display), **Instrument Sans** (body),
**DM Mono** (refs/numerals), **Noto Sans Arabic** (Arabic).

What you are free to change: layout, spacing, hierarchy, density, component
shapes, motion, iconography, empty states, how data is grouped and revealed,
how navigation works, and the whole feel of every screen.

If you believe a charte constraint is actively hurting the product, say so and
make your case. Do not silently override it.

## Hard constraints

Breaking any of these means the redesign is not done.

**1. Three locales, including a right-to-left one.**
`frontend/src/i18n.jsx` holds 464 keys per locale across FR / EN / AR;
`frontend/src/screens/pro/copy.js` holds another 185 per locale. Arabic renders
RTL. Every layout you build must work mirrored — do not reach for `ml-`/`mr-`
or `left`/`right` where a logical property (`ms-`/`me-`, `start`/`end`) belongs.
Any new copy goes into all three locales, never hardcoded into a component.

Verify key parity before you finish:
```
cd frontend && node -e "const fs=require('fs');const s=fs.readFileSync('src/i18n.jsx','utf8');const b=[s.indexOf('const fr = {'),s.indexOf('const en = {'),s.indexOf('const ar = {'),s.indexOf('const LOCALE_KEY')];['fr','en','ar'].forEach((n,i)=>console.log(n,(s.slice(b[i],b[i+1]).match(/^  [A-Za-z0-9_]+:/gm)||[]).length))"
```

**2. Light and dark both ship.**
Dark mode is driven by `--et-*` custom properties with a
`:root[data-theme="dark"]` override and a `prefers-color-scheme` fallback.
Define colours as tokens; never hardcode a hex in a component. Check every
screen in both themes — a redesign that looks right in light and broken in dark
is half-finished.

**3. Money is integer cents, formatted for Morocco.**
Never floating point. Use the existing `money()` helper from
`frontend/src/api.js` and the literal `MAD`. Do not invent a currency
component that reformats.

**4. The hold flow must stay legible under time pressure.**
The seat is claimed the moment a buyer presses **Book**, *before* the form, and
is held for 15 minutes. The countdown is not decoration — it is the single most
important element on `Checkout.jsx`. A buyer must always know how long they
have and what happens when it lapses. If your redesign makes that quieter, it
is wrong.

**5. The gate is used standing up, one-handed, in the dark.**
`screens/pro/Gate.jsx` and `QrScanner.jsx` are operated at a venue door by
staff scanning a queue of people. Verdicts must be unmistakable at arm's length
and distinguishable without relying on colour alone (`ok`, `used`, `cancelled`,
`moved`). Large targets. No hover-dependent affordances. It also runs offline
via `offlineGate.js` — that state must be visible, not silent.

**6. Do not touch the backend.**
`backend/` is out of scope. If you believe an endpoint's response shape blocks
a better UI, stop and tell me; do not change it yourself.

**7. Routes and their paths are fixed.**
See `frontend/src/App.jsx` and `screens/pro/Pro.jsx`. Existing URLs are shared
and bookmarked. You may change navigation *between* them; you may not rename
them.

**8. Accessibility is part of the design, not a pass afterwards.**
Real labels on every control. Visible focus. 4.5:1 text contrast in both
themes. Keyboard-reachable modals that trap focus and close on Escape.
Semantic headings. Hit targets of at least 44px on touch. If a thing is
clickable, it is a `<button>` or an `<a>`.

## Screens in scope

**Buyer** — `Home`, `Explorer`, `EventDetail`, `Checkout`, `Confirmation`,
`Billets`, `TicketDetail`, `ClaimShare`, `Login`, `Organiser`, `Help`, `Legal`,
`StripeForm`.

**Organiser (`/pro`)** — `Overview`, `Events`, `Orders`, `Gate`, `Finance`,
`Placements`, `Offers`, plus `Shell` (dashboard chrome) and `ui.jsx`
(primitives).

**Shared** — `components/Shell.jsx` (public header/footer),
`components/EventCard.jsx`, `components/TicketPass.jsx`,
`components/QrMark.jsx`.

The two areas are deliberately different products: the buyer side is a
consumer storefront, the `/pro` side is an operator tool. Do not flatten them
into one visual language. A dashboard that looks like a landing page is a
dashboard that is slower to use.

## How to work

Build a foundation before screens. A redesign done screen-by-screen produces
the exact inconsistency you are being asked to fix.

1. **Design system first.** Tokens, scale, and a primitive set
   (button, input, select, card, modal, table, badge, toast, empty state,
   skeleton). Replace or rebuild `screens/pro/ui.jsx` rather than adding a
   second parallel set beside it.
2. **One screen as a reference implementation.** Pick the one that exercises
   the most primitives. Show it to me and get agreement before scaling out.
3. **Then the rest**, in dependency order — shared shell and components before
   the screens that consume them.

Keep it working throughout. Do not leave the app broken between steps; I want
to be able to look at it at any point.

## Prove it

After each phase, and before you tell me you are finished:

```
cd frontend && npx tsc --noEmit && npm run build
cd frontend && npm test          # 105 live checks through the proxy
cd backend  && npm test          # 49 unit
cd backend  && npm run test:live  # 116 live API
```

`frontend/npm test` runs `scripts/live-frontend-test.mjs`, which drives every
API call the UI makes through the Next.js proxy and asserts the response shapes
each screen reads. **It is your safety net: if a redesign drops a field a screen
depended on, this catches it.** Both servers must be running
(`backend` on :4100, `frontend` on :3100).

Those suites prove nothing visual. So also, for every screen you touch:

- Confirm it in **light and dark**.
- Confirm it in **FR, EN and AR** — Arabic mirrored, with no clipped or
  overlapping text.
- Confirm it at **375px, 768px and 1440px**, with no horizontal scroll.
- Tab through it: every control reachable, focus always visible.

Report honestly. If a screen is unfinished or a check fails, say which and why.
Do not describe work as complete when it is partial.

## What I care about most

Not novelty. This is a product people spend money on, often in a hurry, on a
phone, sometimes in a queue. I want:

- **Obvious hierarchy.** On any screen it should be clear what matters most.
- **Trust at the moment of payment.** Checkout is where doubt costs money.
- **Speed on the operator side.** Fewer clicks, denser information, no hunting.
- **Consistency**, so the second screen teaches you nothing new.

Make it feel like one product that someone designed, rather than a set of
features that each grew a UI.
