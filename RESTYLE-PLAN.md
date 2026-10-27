# Eventick — UI/UX restyle plan

**Status:** proposed, awaiting two decisions (§2).
**Scope:** `frontend/` only. The backend is out of scope and must not change.
**Date:** 2026-10-27

---

## 1. Why we are doing this

The design is not bad because of taste. It is bad because of **structure**, and
the structure is measurable:

| Finding | Evidence |
|---|---|
| No design system on the buyer side | 25 primitives exist in `screens/pro/ui.jsx`; the 13 buyer screens import **none** of them |
| Buttons are hand-written everywhere | **69 distinct** `rounded-full` button class strings across buyer screens |
| The primary action has two colours | 14 CTAs on Safran, 28 on Lagon, no rule — Checkout pays with Safran, EventDetail books with Lagon |
| Loading looks identical to empty, and to broken | `useCatalog.js` returns `events ?? []`; its `catch` also sets `[]` |
| The catalog is fetched 2×+ per page | `Shell` calls `useCatalog()` and so does every screen inside it; plain `useState`, no sharing |
| Dialogs are inconsistent and partly inaccessible | 4 ad-hoc modals outside `ui.jsx`; `Billets.jsx:274` has no `role`, no Escape, no focus handling |
| The gate verdict is too quiet for a venue door | `Gate.jsx:248` renders the result at `text-base` in a `py-4` strip, `bg-lagon/25` vs `bg-corail/25` — 4 states collapsed into 2 colours |
| Checkout buries its most urgent element | The hold countdown has the same visual weight as the mock-mode notice next to it |

**What is already good and stays:** the token layer in `app/styles.css` —
light/dark via `--et-*` custom properties, RTL font swapping, print overrides
that force tickets to white, `prefers-reduced-motion`. The charte graphique is
sound. `Home.jsx` is a competent marketing page that needs tightening, not
replacing.

So this is **not a repaint**. It is: build the missing component layer, fix the
state handling, then redesign the screens that carry money and pressure.

## 2. Decisions needed before Phase 1

**A. Primary action colour.**
Recommendation: **Lagon primary, Safran reserved for accent and highlight.**
Lagon is the brand colour and already carries twice the usage; reserving Safran
makes it mean something. The cost is that the pay button changes colour.

**B. How far the visual change goes.**
Recommendation: **(b) — genuine redesign within the charte.** New layouts,
density and hierarchy; palette and fonts unchanged.
Alternatives: (a) fix structure and consistency only, keep the current look;
(c) redesign and also propose charte changes where it is hurting us.

Nothing in Phase 1 depends on B, so work can start on A alone.

## 3. Principles

1. **One primitive set, both sides.** Buyer and pro share `src/ui/`. They may
   look different via props and density, never via duplicated components.
2. **Buyer side is a storefront; `/pro` is an operator tool.** Deliberately
   different densities. A dashboard that looks like a landing page is slower to
   use.
3. **Every data surface has four states:** loading, empty, error, loaded.
   Distinguishable. No more conflating them.
4. **Pressure gets weight.** On Checkout the countdown and the total dominate.
   At the gate the verdict dominates. Everything else recedes.
5. **Tokens only.** No hex in a component, ever. If a colour is needed, it
   becomes a token first.
6. **Logical properties only.** `ms-`/`me-`, `start`/`end` — never `ml-`/`mr-`
   or `left`/`right`. Arabic is a first-class locale, not a late pass.
7. **Accessibility is in the component, not in a cleanup phase.** If the
   `Button` is right, every button is right.

## 4. Phases

Each phase ends green: typecheck, build, and the full test suite pass, and the
app is usable. Nothing is left half-migrated between phases.

### Phase 0 — Foundation fixes (no visual change)

Groundwork the rest depends on. Deliberately invisible, so it can ship alone.

- Fix `useCatalog` to share one fetch across the tree (context or a tiny store)
  and expose real `{ events, loading, error }` instead of `events ?? []`.
- Audit the token set for the gaps the redesign will need: a full spacing and
  radius scale, state colours (success/warn/danger/info) as semantic tokens
  rather than raw Lagon/Safran/Corail, and `--color-*` entries for any new
  surface level.
- Decide and document the type scale. `--text-hero` and `--text-display` exist;
  the steps between body and display do not.

**Done when:** one `/api/events` call per page load, every data screen can tell
loading from empty from error, and the token set covers what Phase 1 needs.

### Phase 1 — The design system

Create `frontend/src/ui/`. Promote the good parts of `screens/pro/ui.jsx` and
build what is missing.

| Primitive | Source |
|---|---|
| `Button` | rebuild — one component, variants `primary`/`secondary`/`ghost`/`danger`, sizes `sm`/`md`/`lg`, loading and icon support |
| `Card`, `Badge`, `StatCard`, `EmptyState`, `Skeleton`, `Pager`, `DataTable` + cells | promote from `pro/ui.jsx` |
| `Modal` | promote `pro/ui.jsx`'s version, **add a real focus trap**, then delete the 4 ad-hoc ones |
| `Input`, `Select`, `Textarea`, `Field` | new — wrap the existing `.field` CSS class with label, hint, error and `aria-describedby` wired up |
| `Countdown` | new — the Checkout timer as a component, with urgency states |
| `Verdict` | new — the gate's yes/no panel |
| `Toast` | keep `sonner`, wrap it so every call site is consistent |

Then migrate: replace all **69** buyer button strings with `Button`, and point
the 9 pro screens at `src/ui/` so `pro/ui.jsx` holds only genuinely
dashboard-specific pieces.

**Done when:** no buyer screen hand-writes a button or a modal, and the colour
rule from decision A is enforced by the component rather than by discipline.

### Phase 2 — Reference screen

Pick **Checkout**: it exercises Button, Field, Countdown, Card, the order
summary, Stripe embedding, and the four data states — more primitives than any
other screen, and it is where design failure costs real money.

Rebuild it around the countdown and the total. Form secondary. Then **stop and
review before scaling out** — if the reference screen is wrong, everything
built on it is wasted.

**Done when:** you have approved it in light and dark, FR/EN/AR, at 375 / 768 /
1440px.

### Phase 3 — Shared chrome

`components/Shell.jsx` (public header and footer), `EventCard`, `TicketPass`,
`QrMark`. These appear on every buyer screen, so they come before the screens
that contain them.

### Phase 4 — Buyer screens

In dependency order:

1. `EventDetail` — the tier picker and the Book action that starts the hold
2. `Explorer` — filters, results, real empty and loading states
3. `Home` — tighten hierarchy; it is the least broken
4. `Billets`, `TicketDetail` — ticket list and the manage panel
5. `Confirmation`, `ClaimShare` — the two "you now have a ticket" moments
6. `Login`, `Organiser` — forms
7. `Help`, `Legal` — long-form text

### Phase 5 — Pro screens

1. **`Gate`** first — rebuild the verdict as a full-bleed high-contrast panel,
   one icon plus one word per state, distinguishing all four (`ok`, `used`,
   `cancelled`, `moved`) without relying on colour alone. Make the offline
   state visible rather than silent.
2. `Overview` — the dashboard landing
3. `Orders` — the densest table; the operator's main surface
4. `Placements`, `Offers`, `Finance`, `Events`
5. `pro/Shell` — dashboard chrome

### Phase 6 — Polish

Motion (honouring `prefers-reduced-motion`), focus-visible states everywhere,
print styles re-verified for tickets, and a full accessibility pass.

## 5. Constraints that must not break

Taken from the code as it stands:

- **Three locales, one RTL.** 464 keys per locale in `i18n.jsx`, 185 in
  `pro/copy.js`. All new copy goes into all three. Verify parity:
  ```
  cd frontend && node -e "const fs=require('fs');const s=fs.readFileSync('src/i18n.jsx','utf8');const b=[s.indexOf('const fr = {'),s.indexOf('const en = {'),s.indexOf('const ar = {'),s.indexOf('const LOCALE_KEY')];['fr','en','ar'].forEach((n,i)=>console.log(n,(s.slice(b[i],b[i+1]).match(/^  [A-Za-z0-9_]+:/gm)||[]).length))"
  ```
- **Light and dark both ship.** Check every screen in both.
- **Money is integer cents**, formatted with the existing `money()` helper and
  the literal `MAD`. Never floating point.
- **The 15-minute hold** is the spine of the buying flow. The countdown must
  never get quieter than it is today.
- **The gate runs offline** via `offlineGate.js`, standing up, one-handed, in
  the dark.
- **Routes and paths are fixed** (`App.jsx`, `pro/Pro.jsx`). Navigation between
  them may change; URLs may not.
- **Backend untouched.** If an endpoint's shape blocks a better UI, raise it —
  do not change it.
- **Accessibility:** real labels, visible focus, 4.5:1 text contrast in both
  themes, focus-trapped modals that close on Escape, 44px touch targets.

## 6. How each phase is verified

Automated, after every phase:

```
cd frontend && npx tsc --noEmit && npm run build
cd frontend && npm test            # 105 live checks through the proxy
cd backend  && npm test            # 49 unit
cd backend  && npm run test:live   # 116 live API
```

`frontend/npm test` drives every API call the UI makes through the Next.js
proxy and asserts the response shapes each screen reads. **It is the safety
net: if a redesign drops a field a screen depended on, this fails.** Both
servers must be running (backend :4100, frontend :3100).

Those suites prove nothing visual. So manually, per screen touched:

- light **and** dark
- FR, EN **and** AR — mirrored, nothing clipped or overlapping
- 375px, 768px, 1440px — no horizontal scroll
- tab through: every control reachable, focus always visible

## 7. Risks

| Risk | Mitigation |
|---|---|
| RTL breaks silently during a big refactor | Logical properties enforced in the primitives; AR checked per screen, not at the end |
| Dark mode rots as components are rewritten | No hex in components — tokens only; both themes checked per screen |
| A redesign drops a field a screen read | `frontend/npm test` catches exactly this |
| Scope creep into the backend | Backend is explicitly out of scope; blockers get raised, not fixed |
| The reference screen is wrong and everything inherits it | Phase 2 is a hard review gate before Phase 3 |
| 69 button migrations introduce regressions | Mechanical, one screen at a time, suite green after each |

## 8. What I need from you to start

1. **Decision A** — primary colour (recommendation: Lagon primary, Safran accent).
2. **Decision B** — how far the visual change goes (recommendation: (b), redesign within the charte).

With A alone I can start Phase 0 and Phase 1 immediately, since neither depends
on B.
