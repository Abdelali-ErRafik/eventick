# Waitlist — how it works

A sold-out event is a dead end: a buyer arrives, finds nothing, and leaves.
Meanwhile seats really do come free — refunds, cancellations, checkouts people
walk away from. The waitlist connects the two, without anybody watching.

---

## The idea in one line

**When a seat frees up, it is offered to whoever has waited longest, held for
them for 30 minutes, and passed on if they do not take it.**

---

## The four states

```
   joins the queue
         │
         ▼
      WAITING ──────── a seat frees up ───────▶ OFFERED
                                                   │
                                   ┌───────────────┴───────────────┐
                                   │                               │
                           buys within 30 min              30 min pass
                                   │                               │
                                   ▼                               ▼
                               CLAIMED                         EXPIRED
                                                                   │
                                            the seat goes to the next WAITING
```

On the **Offres** screen these read **En attente**, **Place réservée**,
**Place prise** and **Délai dépassé**.

---

## Joining

A buyer on a sold-out event sees a waitlist form instead of a buy button. They
leave an email. No account needed.

One address per event: asking twice returns **409 "Already on the waitlist"**,
so nobody can stack the queue by submitting five times.

---

## What counts as "a seat frees up"

Any of these calls `offerFreedSeats()`:

| Event | Where |
|---|---|
| An order is **refunded in full** | `lib/refund.ts` |
| An organiser **cancels an order** | `routes/organiser.ts` |
| A **checkout hold expires** or is released | `lib/sweeper.ts`, `routes/orders.ts` |
| A ticket is **cancelled** by its holder | `lib/ticket-admin.ts` |
| An organiser **adds seats** to a tier | `routes/organiser.ts` |

A *partial* refund does not free a seat — the ticket stays valid, so there is
nothing to give away. Nor does LOWERING capacity, which frees nothing.

> New seats reach the queue before the public. Adding capacity to a sold-out
> event used to put the seats straight in the catalogue, so a stranger
> refreshing the page bought what the queue had been waiting for.

---

## Who gets it

Oldest first, strictly:

```js
orderBy: { createdAt: "asc" }
```

No priority, no queue-jumping. If three seats free at once, the first three
people are offered one each.

---

## The 30-minute hold is real

This is the part that makes it trustworthy. An offered seat is **subtracted
from public availability**:

```js
capacity − committed − outstanding offers = what anyone else can buy
```

So while you hold an offer, nobody can buy that seat out from under you. Try
it and the server answers **409 "Not enough tickets remaining"**.

The window is **30 minutes** (`CLAIM_WINDOW_MINUTES`).

---

## The claim link

The offer email carries a link like:

```
/evenements/<event>?claim=zgggXAXGZRP2WX7inxDLC_IoEhEBH2uv
```

That token is:

- **unguessable** — 24 random bytes from a cryptographic generator
- **single-purpose** — it buys one seat of one tier, nothing else
- **cleared once used** — `claimToken: null` the moment the order is paid

It works **without an account**, because the person who joined the waitlist
was a stranger and asking them to register first would lose them.

A token that has lapsed or already been used returns **410 Gone**, not a
confusing 404 — the offer was real, it is simply over.

---

## When the window lapses

A sweeper runs every **5 minutes** inside the server and does two things:

1. Marks expired offers `EXPIRED` and clears their tokens.
2. Re-runs `offerFreedSeats()`, so the released seat is offered to the next
   person in line.

Nobody has to notice. That is the whole point.

---

## Two things that could bite

**1. No email key, no waitlist.** Offers are delivered by email. If
`RESEND_API_KEY` is unset the mail is written to the log and dropped — the
offer is still made and the seat still held, but nobody is told, so every
offer lapses after 30 minutes and the queue drains to EXPIRED. Run
`.\payment-mode.ps1`; it reports whether email is live.

**2. A cancelled event offers nothing.** `offerFreedSeats()` returns early
unless the event is `PUBLISHED`, so cancelling an event does not spray offers
at a waitlist for a show that is not happening.

---

## Seeing it work

```bash
cd backend && npx tsx ../scripts/demo-waitlist.mjs
```

Builds a two-seat event, sells it out, queues three people, refunds a buyer,
shows the seat being offered automatically, proves nobody else can buy it,
then backdates the offer and sweeps so the lapse-and-pass-on is visible
without waiting half an hour. Deletes the event afterwards.

By hand: `QUICK_TEST.md` step 8.

---

## Where the code lives

| | |
|---|---|
| The cycle | `backend/src/lib/waitlist.ts` |
| The 5-minute sweeper | `backend/src/lib/sweeper.ts` |
| Joining | `POST /api/events/:slug/waitlist` |
| The organiser's view | `GET /api/organiser/events/:slug/waitlist` → **Offres** |
| Redeeming a claim | `POST /api/orders/hold` with `claimToken` |
