# Eventick — test it in 20 minutes

A short walk through the things that actually matter: a stranger buys a
ticket, it opens the gate, the organiser gets paid, and Eventick takes its
cut. Nine steps, in the order the money moves.

Everything is in **French** on screen — that is the shipped language. The
English in quotes below is only so you know what you are looking at.

> For the exhaustive version — every permission boundary, every refusal, every
> edge case — see `TEST_GUIDE_EN.md` (19 checks). This is the short road.

---

## Before you start

**Two terminals, left running:**

```bash
cd backend && npm run dev      # API on :4100
cd frontend && npm run dev     # site on :3100
```

**Three accounts** (created by `npm run db:seed`):

| Role | Email | Password |
|---|---|---|
| Customer | `client@eventick.ma` | `eventick-client-2026` |
| Organiser | `organisateur@eventick.ma` | `eventick-orga-2026` |
| Admin | `admin@eventick.ma` | `eventick-admin-2026` |

In development the sign-in page has one-click buttons for all three, so you
do not have to type these.

**Payments have two modes**, and the one you want depends on the step:

```powershell
.\payment-mode.ps1            # which mode am I in?
.\payment-mode.ps1 mock       # checkout settles instantly  <- for steps 1-9
.\payment-mode.ps1 cmi        # the real CMI gateway        <- for step 10
```

**Restart the backend after switching** — `tsx watch` watches `src/`, not
`.env`.

> ⚠️ Start in **mock** mode. In CMI mode a payment only completes when CMI
> calls back, so nothing settles on a laptop and every step below stops at
> "waiting for payment". That is a mode difference, not a bug.

---

## 1 · Buy a ticket as a stranger

No account. This is how most buyers arrive.

1. Open **http://localhost:3100** in a private window.
2. Pick any event → **"Réserver"**.
3. Choose a quantity, enter a name, email and phone.
4. Pay.

**✔️ You should see** a confirmation page with your ticket reference, shaped
like `ET-2027-XXXXXXXX`.

> 🎯 **Keep this tab open.** The URL contains `?k=…` — that token is the only
> thing proving the ticket is yours. Without an account, it is your receipt.

---

## 2 · The email arrives, with the PDF

Check the inbox you used.

**✔️ You should get** *"Paiement confirmé"* with the event, every ticket
reference, the total, and **a PDF attached** holding one page per ticket:
a QR code, the holder, zone and gate, and the reference.

> 🎯 **Nobody sent this.** The moment the payment settled, the server issued
> the tickets, rendered the PDF and posted it. An organiser cannot be awake
> at 2am to email tickets to whoever just bought one.

> 💡 No email? Run `.\payment-mode.ps1` — it reports whether `RESEND_API_KEY`
> is set. Without it, mail is written to the log and never sent.

---

## 3 · The link is the key, and it has limits

1. Copy the confirmation URL **without** its `?k=…` and open it elsewhere.

**✔️ "Commande introuvable".** The order id is not a credential.

2. Now open it **with** `?k=…`.

**✔️ The order appears.** The token is enough to SEE a ticket and to correct
a misspelled name — and deliberately not enough to refund it or give it
away. Links get forwarded and screenshotted.

---

## 4 · The QR opens the gate, once

Sign in as the **organiser** → sidebar **OPÉRATIONS → Porte**.

1. Switch to the manual tab, type the reference from step 1, submit.

**✔️ Green, admitted.**

2. Submit the same reference again.

**✔️ Red, "déjà utilisé".** One seat, one entry. This is the whole point of a
ticketing system.

3. Scanned the wrong person? Click **"Annuler cette entrée"** under the
   verdict and confirm.

**✔️ The ticket admits again** — and the undo is recorded in the journal,
because re-admitting a spent ticket is worth being able to account for.

---

## 5 · Refund it

Still the organiser → **CATALOGUE → Réservations**. Find the order → **Rembourser**.

**✔️ The order flips to "Remboursé" and the buyer gets an email.**

> 🎯 Watch what happens to the commission on the Finance screen: refunding
> takes Eventick's cut back with it. The platform does not keep a fee on
> money that was returned.

---

## 6 · Where the money went

Organiser → **FINANCES → Finance**.

| Figure | Means |
|---|---|
| **Recettes nettes** | what buyers paid, less refunds |
| **Commission Eventick** | the platform's cut — 5% on Starter |
| **À reverser** | what Eventick still owes this organiser |
| **Déjà versé** | what has already been transferred |

The buttons at the top — *Aujourd'hui · Cette semaine · Ce mois · …* — narrow
every figure to a period and chart the sales underneath.

> 🎯 **The buyer pays the ticket price, nothing more.** The commission is
> taken out of the organiser's share, not added to the buyer's bill. A 350 MAD
> ticket costs the buyer 350; the organiser receives 332,50.

Scroll down for **Plan**: Starter 5%, Pro 3% + 499/month, Business 2% +
1 999/month. Only Eventick assigns a plan — an organiser may **Demander** one,
and an admin decides. Once there is a full month of sales, this card says
whether a cheaper plan would have cost less.

---

## 7 · Pay the organiser

Sign in as the **admin** → **ADMINISTRATION → Plateforme**.

1. In **"Qui vend"**, each organiser shows lifetime revenue and **"à reverser"**.
2. Click **"Préparer un reversement"** → a period is pre-filled → create it.

**✔️ A payout appears**: gross − commission − subscription = the net transfer.

3. **"Marquer comme versé"**, with the bank reference from the real transfer.

**✔️ It reads PAID, and "à reverser" drops to zero.**

> 🎯 Running it twice over the same orders is refused. An order belongs to one
> payout, ever — enforced by a database constraint, not by a check that could
> be raced.

> 💡 A payout needs bank details on file, or it is refused. The organiser sets
> their own RIB on Finance; an admin cannot type it for them.

---

## 8 · A sold-out event takes a waitlist

The event **`soiree-complete`** has two seats and both are sold.

> 💡 If it is not sold out when you get here — because an earlier step
> refunded it — buy its remaining seats first, or run
> `cd backend && npx tsx ../scripts/demo-waitlist.mjs`, which builds its own
> sold-out event and cleans up after itself.

1. Open **http://localhost:3100/evenements/soiree-complete**.

**✔️ No buy button — a waitlist form instead.** Join with any email.

2. Organiser → **CATALOGUE → Offres**. Your entry reads **"En attente"**.
3. Now free a seat: refund one of that event's orders from **Réservations**.
4. Refresh **Offres**.

**✔️ Your entry now reads "Place réservée"** with an expiry time, and an email
has gone out — **nobody pressed anything**. The seat is held for 30 minutes
and is NOT on sale to anyone else meanwhile. If the window lapses, it passes
to the next person in line.

> 💡 To watch the whole cycle without waiting 30 minutes:
> `cd backend && npx tsx ../scripts/demo-waitlist.mjs`

---

## 9 · Promo codes

Organiser → **Offres** → **Ajouter**.

Make a code, then use it at checkout on step 1.

**✔️ The total drops, and the counter on the card moves** (`1/200`). Once it
reaches its cap, the code stops working. A code can be tied to one event or
left open to all of them.

---

## 10 · The real payment gateway

Everything above ran on mock payments. To exercise the real CMI redirect:

```powershell
.\payment-mode.ps1 cmi
# then restart the backend
```

Buy a ticket. Instead of settling instantly, you are sent to CMI's hosted
card page with a signed form.

**✔️ That redirect is the test.** On a laptop the payment will not complete:
CMI confirms a sale by calling a public URL back, and it cannot reach
`localhost`. A ticket is issued only when that callback arrives — never on
the browser returning, because a browser can lie about its own payment and
may never come back at all.

Switch back to `mock` to carry on testing.

---

## If something looks wrong

| What you see | What it means |
|---|---|
| Checkout stops at "waiting for payment" | You are in **cmi** mode. `.\payment-mode.ps1 mock`, restart the backend |
| No emails arrive | `RESEND_API_KEY` is unset — mail is logged, not sent. `.\payment-mode.ps1` reports this |
| **429** on sign-in | A rate limiter: 10 sign-ins per 15 minutes. Restart the backend to clear it |
| A screen is empty that should not be | Check the backend terminal — a 500 shows there, not on screen |
| "Catalogue vide" | `cd backend && npm run db:seed` |

## Starting over

```bash
cd backend && npm run db:seed      # restores the 16 events and 3 accounts
```

Safe to re-run: it upserts, so it repairs the catalogue without wiping the
orders you created.
