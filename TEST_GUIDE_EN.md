# 🎟️ Eventick — hands-on test guide

**Nineteen checks. Do them in any order.** Every step says exactly where to click and what you must see.

Checks **1–12** cover the buying, ticketing and admin surface. Checks **13–15**
cover the money side — commission, payouts and the audit journal. Checks
**16–19** cover what an organiser needs in the first week of running a real
event: a cap on how many one person may buy, sales windows, calling an event
off, and free tickets that are not a sale. Those four are the newest part and
the part worth most attention.

> 📅 30/10/2026 · Written by walking the running app at **http://localhost:3100**. The interface ships in **French**; every label in quotes below is the text actually on screen. Switch to English from the account menu if you prefer — the checks work the same.

---

## 🚀 Before you start (5 minutes)

### 1. Start the app

```bash
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd frontend
npm run dev
```

Open **http://localhost:3100**.

### 2. Check the API is alive

```bash
curl --url 'http://localhost:4100/api/events'
```

**✔️ You must see** a reply starting `{"events":[…`. If you get a connection error, the backend is down. If you see `{"events":[]}`, the database is not seeded — see *Start clean* below.

### 3. The three accounts

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@eventick.ma` | `eventick-admin-2026` |
| **Organiser** | `organisateur@eventick.ma` | `eventick-orga-2026` |
| **Customer** | `client@eventick.ma` | `eventick-client-2026` |

> ⚠️ **Only 10 sign-ins per 15 minutes**, for the whole machine. If you see *"Trop de tentatives"*, wait — or restart the backend, which resets the counter. **Tip:** use a different browser profile (or a private window) per role so you are not signing in and out constantly.

### 4. Paying

Payments run in **mock** mode — **no card is ever charged**. Checkout settles instantly and issues real tickets.

> **Switching on the real gateway (CMI).** Put `CMI_CLIENT_ID` and `CMI_STORE_KEY` in `backend/.env` and restart. Checkout then shows a *"Payer … sur CMI"* button that posts a signed form to CMI's own card page instead of settling on the spot.
>
> Two things to know before trying it:
>
> - The **store key is not emailed to you.** You set it yourself in the CMI back office under *Administration → Changer les clés du magasin*, and `CMI_STORE_KEY` must match it exactly — otherwise CMI refuses every payment with `INVALID_HASH`.
> - **CMI calls back from its own servers**, so it cannot reach `localhost`. Without a public callback URL the payment succeeds at CMI and **no ticket is ever issued**. Expose the API with a tunnel (ngrok, cloudflared) and set `CMI_CALLBACK_URL` to the public address.
>
> Test cards come with the CMI integration kit; they are not reproduced here.
>
> **The slow-buyer cases.** These are worth testing deliberately, because they
> cannot happen with an in-page card form and they are where money and tickets
> can come apart. The rule the server enforces is: *the buyer is charged only
> if they end up holding something.* `ACTION=POSTAUTH` is the reply that takes
> the money, so it is sent if and only if a ticket exists.
>
> | What you do | What should happen |
> |---|---|
> | Sit on CMI's page for over 15 minutes, then pay | Payment **refused**, nothing charged. The hold lapsed and the seats went back on sale. |
> | Pay, then let CMI retry the callback (or replay it) | Money accepted again, but **no second ticket** — the order already delivered. |
> | Hold the last seat, let the hold lapse, have someone else buy it, then pay | Payment **refused**. The tier is never oversold. |
> | Start buying a resold ticket, have the seller cancel the listing, then pay | Payment **refused**, the seller keeps their seat. |
>
> `npm run test:live:cmi` (from `backend/`, with CMI configured) checks all
> four automatically.

### 5. Commission and payouts

Money reaches Eventick's CMI account, not the organiser's, so the organiser's
share is transferred separately. Three screens are involved:

| Where | Who | What |
|---|---|---|
| **Admin → Plateforme** | admin | Assign each organiser a plan (Starter 5%, Pro 3% + 499/mo, Business 2% + 1 999/mo), and run payouts |
| | | The monthly part is withheld from the payout, once per calendar month that had sales |
| **Pro → Finance** | organiser | See net revenue, commission, what is owed — and enter their RIB |
| **Pro → Finance** | organiser | Their own payout history |

Worth testing deliberately, because each one protects money:

| What you do | What should happen |
|---|---|
| As the organiser, try to change your own plan | Not possible — the plan is read-only on Finance, and the API answers 403 |
| Sell a ticket, then have an admin move you to a cheaper plan | The commission already recorded **does not change**. Only later sales use the new rate |
| Refund half an order | Net revenue *and* commission both halve |
| Run a payout before entering a RIB | Refused — there is nowhere to send it |
| Run the same period twice | The second run finds nothing: an order belongs to one payout, ever |
| Mark a payout paid without a reference | Refused — the row could not be reconciled against a statement |
| Refund something *after* its payout was marked paid | The payout's total does not move; it is a record of money already sent |
| Resell a ticket | The platform takes its commission on the resale too, and the seller's ticket reads **transferred**, not refunded |
| Run a payout twice over one month | The subscription is charged **once**; only new orders add commission |
| Run a payout over a very wide period | Only months that actually had sales are charged a subscription — a dormant month is free |
| Cancel a pending payout | Its orders *and* its subscription months are released for a later run |

`npm run test:live:orders` (from `backend/`) walks the whole path — hold, pay,
settle, refund, resell, commission, subscription, payout — in 75 checks.
`npm run test:live:money` covers the commission and payout rules on their own.

### 6. The journal, and removing an account

**Admin → Journal** lists who did what. It is gated on `scope.any`, the same
as the rest of the platform console, because the rows describe money and
accounts across every organiser.

| What you do | What should happen |
|---|---|
| Change someone's role, grant a permission, refund an order, assign a plan, send a payout | Each appears in the Journal with your email, what changed (both ends) and when |
| Filter by action | Only that action's rows |
| Open the Journal as the organiser | Refused — it is admin-only |
| **Équipe →** remove a brand-new account | Deleted outright; the Journal still shows it existed and who removed it |
| Remove an account that has orders | **Anonymised**, not deleted — the dialog says so *before* you confirm. Orders and tickets survive; the old login stops working |
| Try to remove yourself, or another admin | Refused. One compromised admin cannot clear out the others |

`npm run test:live:audit` (from `backend/`) checks all of this in 46 checks,
including the one that matters most: a record survives the deletion of the
person who made it.

---

### 7. Start clean (when you need to)

The seed is **idempotent** — running it again does not duplicate anything, so
it is safe whenever the catalogue looks wrong:

```bash
cd backend
npm run db:deploy    # apply any migrations you do not have yet
npm run db:seed      # 16 events, 2 promo codes, the three accounts above
```

**✔️ You must see** `Seeded 16 events and 2 promo codes.`

The baseline is **16 events** (14 owned by the admin, 2 by the organiser),
**3 accounts** and the orders the seed creates. If you have been running the
automated suites, extra test accounts and events may be left behind; they are
harmless, but `npm run db:seed` will not remove them.

> 💡 `npm run db:studio` opens Prisma Studio if you want to look at the rows
> directly — useful for checking a commission or a payout by hand.

---

## 🧭 Where things are

**Public site** — Explorer · event pages · checkout · your tickets
**Dashboard** (`/pro`) — the sidebar is grouped under small grey headings. Paths below are written as **group → item → button**.

| Group | Items | Who sees it |
|---|---|---|
| **PILOTAGE** | Pilotage · Réservations | organiser + admin |
| **CATALOGUE** | Événements · Placements · Invitations · Offres | organiser + admin |
| **OPÉRATIONS** | Porte | organiser + admin |
| **FINANCES** | Finance | organiser + admin |
| **ADMINISTRATION** | Plateforme · Équipe · Permissions · Journal | **admin only** |

> 💡 The group headings are labels, not buttons — click the item under them.
> 💡 **The sidebar is permission-driven.** An item you cannot use does not appear at all. That is check 9.

### What already exists

**16 events** across Casablanca, Rabat, Marrakech, Tanger, Agadir, Essaouira, Fès and Dakhla — 14 owned by the admin account, 2 by the organiser
**Promo codes:** `SAFRAN15` (−15 %) and `CASA50` (−50 MAD)
**Commission plans:** Starter 5 % · Pro 3 % + 499 MAD/month · Business 2 % + 1 999 MAD/month — Starter is the default
**Rules:** seats are held **15 minutes** · buyers may cancel up to **48 h** before the event · one buyer may hold **10 tickets** per event · resale is **off** until the organiser turns it on

> 💡 The last two are per-event defaults an organiser can change — Pro →
> **Événements** → the sliders icon. Checks 16 and 18 cover them.

---

# 🎫 CHECK 1 — Buy a ticket with no account at all

> **The task:** a visitor can browse, pay and get a working QR without ever creating an account. A signup wall in front of the Pay button is the single biggest conversion loss on a ticketing site.

### Step 1 — Browse as a stranger

1. Open a **private window** at http://localhost:3100 — do not sign in.
2. Click **"Explorer"** in the header.
3. Click any event card.

### Step 2 — Reserve

4. On the event page, pick a ticket tier and press **+** once.
5. Click the booking button.

**✔️ You must see** the checkout page, with a **countdown** running at the top.

> 🎯 The seat is claimed *now*, before you type anything. You should never fill in a whole form and only then be told the tickets are gone.

### Step 3 — Pay

6. Fill in **Nom**, **E-mail** and **Téléphone** (any plausible values — `0612345678` works).
7. Click the pay button.

**✔️ You must see** the confirmation page: a green check, **"Paiement accepté"**, the amount, and one ticket card per seat with a **QR code** and a green **"Valide à l'entrée"** badge.

### Step 4 — The ticket really works

8. Click **"Afficher le pass d'accès"** on a ticket.

**✔️ You must see** the ticket page with a large QR, the event, the zone and gate, and the holder's name.

9. Click the **download icon** (top right of that page).

**✔️ You must see** a PDF download. Open it: dark header, `Eventick.ma` wordmark, QR, and a reference like `ET-2027-…`.

> 🎯 **This is the whole check.** You never created an account. You have a real ticket, a real QR and a printable PDF.

🧹 **Clean up:** nothing. This is a normal sale.

✅ **Check 1 done.**

---
---

# 🔒 CHECK 2 — The link is the key, and it has limits

> **The task:** a guest's only credential is the link they were given. That is enough to *use* the ticket. It is deliberately **not** enough to refund the money or give the seat away — links get forwarded, screenshotted and left in group chats.

### Step 1 — Keep the link from check 1

1. Copy the confirmation URL from check 1. It looks like
   `http://localhost:3100/confirmation/cmv…`

### Step 2 — Open it somewhere else

2. Open a **second private window** and paste the URL.

**✔️ You must see** — hmm. Check what happens.

| What you see | Why |
|---|---|
| The order, with tickets | Your browser kept the token from the purchase |
| **"Commande introuvable"** | Correct — this window never had the token |

> 💡 To test properly, copy the URL **with** its `?k=…` if present. Without the token, a stranger gets nothing.

### Step 3 — Try to act on the ticket without the token

3. In the window where the ticket *does* open, click **"Afficher le pass d'accès"**.
4. Scroll to **"Gérer ce billet"**.

**✔️ You must see** a panel offering **"Corriger le nom"** — and a box explaining that an account is needed to cancel, resell or give the ticket away.

**✔️ You must NOT see** **"Annuler et me faire rembourser"** or **"Offrir ce billet"** while signed out.

> 🎯 **This is the whole check.** A forwarded link can show a ticket. It cannot spend your money or hand away your seat.

### Step 4 — Prove it at the API level (optional)

```bash
# Replace TICKET_ID with the real id from your /billet/… URL
curl -s -w "\n  HTTP %{http_code}\n" \
  -X POST 'http://localhost:4100/api/tickets/TICKET_ID/cancel'
```

**✔️ You must see** `{"error":"This order is not yours"}` and **HTTP 403**.

> ⚠️ If you get **404**, the id is wrong — a ticket that does not exist is a genuine 404, and that is not the check. Copy the id from the address bar of a real ticket page.

✅ **Check 2 done.**

---
---

# 👤 CHECK 3 — Claim a guest order into an account

> **The task:** "create an account" must not be a dead end. Registering alone does not attach the tickets you already bought — claiming does.

### Step 1 — Register with the buyer's email

1. Still on the ticket page from check 2, click the button in the claim box.
2. If you are signed out, you land on **"Se connecter"**. Create an account — use **any** email.

### Step 2 — Claim

3. Go back to the ticket page and click the claim button again.

**✔️ You must see** a success toast, and the management panel now shows **"Annuler et me faire rembourser"** and **"Offrir ce billet"**.

### Step 3 — The order is now yours

4. Click **"Voir mes billets"** in the header (or go to `/billets`).

**✔️ You must see** the order you bought as a guest, now listed in your account.

> 🎯 Before claiming, that list was empty — registering alone does not adopt past orders.

### Step 4 — Nobody else can take it

5. Sign out, register a **second** account, and try to claim the same order.

**✔️ You must see** it refused: *"Cette commande appartient déjà à un autre compte."*

> 🎯 Two people can hold the same link. The first to claim it is the one the refund will go to.

✅ **Check 3 done.**

---
---

# 🎁 CHECK 4 — Give a ticket away

> **The task:** sharing hands the seat to someone else safely. Nothing moves until they claim it, and until then you can pull it back. The recipient gets a **new** ticket; yours stops working.

### Step 1 — Create the link

1. Signed in (from check 3), open a ticket → **"Gérer ce billet"** → **"Offrir ce billet"**.
2. Optionally type a message.
3. Click the create button.

**✔️ You must see** a toast saying the link was copied.

### Step 2 — Claim it as someone else

4. Paste the link in a **private window**. It looks like `/billet-offert/…`.

**✔️ You must see** the offer: who sent it, the event, the seat.

5. Type a name and claim it.

**✔️ You must see** a QR straight away — the recipient has no account and needs none.

### Step 3 — The sender's ticket is dead

6. Back in your own window, reload the original ticket.

**✔️ You must see** the ticket is no longer valid — its QR will not admit anyone.

> 🎯 **This is the point.** Emailing a PDF leaves two working QRs for one seat. This leaves exactly one.

### Step 4 — Revoking (do this on a fresh ticket)

7. Create a share link on another ticket, then click the revoke button **before** anyone claims it.
8. Open the link.

**✔️ You must see** it refused — the offer is gone, and your ticket still works.

✅ **Check 4 done.**

---
---

# 🚪 CHECK 5 — The gate: a QR scans exactly once

> **The task:** the door must admit a valid ticket and refuse the same ticket twice — that is the whole anti-fraud story.

### Step 1 — Open the gate

1. Sign in as **organiser** (or admin).
2. Sidebar → **OPÉRATIONS** → **Porte**.

### Step 2 — Admit a ticket

3. Take a ticket reference from a ticket page — it looks like `ET-2027-ABC123`.
4. Type it into the manual field and submit.

**✔️ You must see** a green result: the ticket is admitted, with the holder's name.

### Step 3 — Try it again

5. Submit the **same** reference a second time.

**✔️ You must see** it refused, saying the ticket is already in.

> 🎯 **This is the whole check.** One ticket, one entry.

### Step 4 — A made-up reference

6. Type `ET-2027-NOPE99` and submit.

**✔️ You must see** a clear "no such ticket" result, not a crash.

✅ **Check 5 done.**

---
---

# 📅 CHECK 6 — Publish an event

> **The task:** an organiser can put a date on sale in one form, and it appears in the public catalogue immediately.

### Step 1 — Open the form

1. Signed in as **organiser**, click **"Créer un événement"** in the header.

**✔️ You must see** the form split into four named sections: **L'essentiel**, **Quand et où**, **Billets et tarifs**, **Visuel et description**.

### Step 2 — Use the shortcut (optional)

2. In the **"Gagner du temps"** card at the top, click the example-filling link.

**✔️ You must see** several fields fill themselves in.

### Step 3 — Check the date and time pickers

3. Click the **Date** field.

**✔️ You must see** a calendar that matches the app's theme — **not** the browser's grey-and-blue one. Weeks start on **Monday**.

4. Click the **Heure** field.

**✔️ You must see** two columns, **24-hour**, with no AM/PM.

> 🎯 These are the app's own controls. The browser's versions ignored the dark theme entirely and showed `12/20/2026` with an AM/PM column.

### Step 4 — Publish

5. Fill in at least **Nom de l'événement**, **Lieu**, a date, a price and a capacity.
6. Click **"Publier sur l'agenda"**.

**✔️ You must see** a success toast, and the event appears in the **"Vos événements"** column on the right.

7. Open **"Explorer"** in a new tab.

**✔️ You must see** your event in the public catalogue.

🧹 **Clean up:** delete it from **CATALOGUE → Événements** if you like. An event with sales cannot be deleted — hide it instead, which is deliberate.

✅ **Check 6 done.**

---
---

# 💸 CHECK 7 — Refunds, and who is allowed to make them

> **The task:** refunding moves money, so it is its own capability — separate from merely seeing the money.

### Step 1 — Refund an order

1. Signed in as **organiser**, sidebar → **PILOTAGE** → **Réservations**.
2. Find a paid order and refund it.

**✔️ You must see** the order marked refunded and its tickets voided.

### Step 2 — Try to refund it twice

3. Refund the same order again.

**✔️ You must see** it refused.

### Step 3 — The capability is real (admin)

4. Sign in as **admin** → **ADMINISTRATION** → **Permissions**.
5. Find **`finance.refund`** and switch it **off** for **Organisateur**.
6. In another window, as the organiser, try to refund an order.

**✔️ You must see** it refused.

7. Switch **`finance.view`** off too.

**✔️ You must see** **Finance** disappear from the organiser's sidebar entirely.

> 🎯 **This is the whole check.** These toggles used to do nothing — the organiser kept reading revenue and issuing refunds regardless.

🧹 **Clean up:** switch both permissions back on.

✅ **Check 7 done.**

---
---

# 🙋 CHECK 8 — Becoming an organiser

> **The task:** a customer can ask to sell tickets, and an admin decides. Before this, the biggest button on the site went nowhere for them.

### Step 1 — Ask

1. Sign in as the **customer** (`client@eventick.ma`).
2. Click **"Créer un événement"** in the header.

**✔️ You must see** the page **"Vendez vos billets sur Eventick"** — *not* a silent bounce back to the homepage.

3. Fill in the form and click **"Envoyer ma demande"**.

**✔️ You must see** the status change to *"Demande en cours d'examen"*.

### Step 2 — One request at a time

4. Reload and try to submit again.

**✔️ You must see** the pending status, not a second form.

### Step 3 — Decide, as admin

5. In another window, sign in as **admin** → **ADMINISTRATION** → **Équipe**.

**✔️ You must see** a **"Demandes d'organisateur"** panel with a count badge, showing who asked, their phone and their pitch.

6. Click **"Approuver"**.

### Step 4 — The promotion is immediate

7. Back in the customer's window, reload.

**✔️ You must see** they are now an organiser — the dashboard opens, no re-login needed.

> 🎯 Permissions resolve on every request, so the change reaches the session they already have.

### Step 5 — Declining (optional)

8. Repeat with a second account and click **"Refuser"**, with a reason.

**✔️ You must see** the applicant shown the reason, still a customer, and able to apply again.

🧹 **Clean up:** demote the test account from **Équipe** if you like.

✅ **Check 8 done.**

---
---

# 🛡️ CHECK 9 — The sidebar only shows what you may use

> **The task:** a menu must never promise something the server refuses. Hiding an item is not security — but showing a dead one is a bug.

### Step 1 — Compare the two sidebars

1. Sign in as **organiser**. Note the sidebar.
2. Sign in as **admin** in another window.

**✔️ You must see** the admin has an extra **ADMINISTRATION** group: **Plateforme**, **Équipe**, **Permissions**. The organiser has none of it.

### Step 2 — Typing the URL directly

3. As the **organiser**, type `http://localhost:3100/pro/users` in the address bar.

**✔️ You must see** you are redirected away — not a screen full of failed requests.

### Step 3 — Flip a capability live

4. As **admin** → **Permissions**, switch **`promo.manage`** **off** for Organisateur.
5. Reload the organiser's window.

**✔️ You must see** **Offres** gone from their sidebar.

6. Switch it back on and reload.

**✔️ You must see** it return.

🧹 **Clean up:** make sure `promo.manage` is back on.

✅ **Check 9 done.**

---
---

# 🏛️ CHECK 10 — The admin's platform console

> **The task:** an admin runs a marketplace, not one organiser's events. Their dashboard used to be an organiser's with bigger numbers.

### Step 1 — Open it

1. Signed in as **admin**, sidebar → **ADMINISTRATION** → **Plateforme**.

**✔️ You must see** figures no organiser screen gives you:

| Tile | What it answers |
|---|---|
| **Volume encaissé** | everything sold, refunds included |
| **Net après remboursements** | with a refund rate |
| **7 derniers jours** | with the week-on-week move |
| **Comptes** | total, and how many joined this week |

### Step 2 — The breakdowns

**✔️ You must see** three panels: accounts by role, catalogue by status, orders by status.

### Step 3 — Who is actually selling

**✔️ You must see** a **"Qui vend"** list, ranked by volume, **including anyone at zero** — that is the useful part.

> 💡 The **admin account** may appear in this list. That is correct: it owns the 14 seeded events. The row shows its role so it explains itself.

### Step 4 — It reconciles

2. Compare the **Volume encaissé** tile with the sum of the "Qui vend" rows.

**✔️ You must see** they match.

### Step 5 — It is admin-only

```bash
curl -s -o /dev/null -w "%{http_code}\n" 'http://localhost:4100/api/platform/stats'
```

**✔️ You must see** `401`. Signed in as an organiser it is `403`.

✅ **Check 10 done.**

---
---

# 🌍 CHECK 11 — Three languages, and Arabic mirrors

> **The task:** the interface is French, English and Arabic, and Arabic flips the whole layout right-to-left.

### Step 1 — Switch language

1. Anywhere in `/pro`, open the **account menu** (top right).
2. Under **LANGUE**, click **EN**.

**✔️ You must see** the interface in English — sidebar, titles, buttons.

3. Click **عربي**.

**✔️ You must see** Arabic **and** the layout mirrored: sidebar on the right, text right-aligned, arrows pointing the other way.

### Step 2 — The public site too

4. Go to the public site and switch language there.

**✔️ You must see** event titles change language — they are stored in both.

> ⚠️ **Two deliberate exceptions.** The **ticket PDF** is French-only: the PDF engine has no Arabic text shaping, so Arabic would come out disconnected and reversed. Some **server error messages** are French — the interface is translated, server strings are not.

✅ **Check 11 done.**

---
---

# 🌓 CHECK 12 — Dark and light, and no stray browser chrome

> **The task:** every control belongs to the app. Native browser widgets ignore the theme and are the one thing that breaks the illusion.

### Step 1 — Switch theme

1. Account menu → **"Passer en clair"**.

**✔️ You must see** the whole dashboard flip to light, including cards, the sidebar and the charts.

2. Switch back to dark.

### Step 2 — Open every kind of dropdown

3. On the event form (`/organiser`), open **Catégorie**.

**✔️ You must see** a themed list with a check mark on the current item — **not** a white system list with a blue highlight.

4. Open the **Date** and **Heure** fields.

**✔️ You must see** the app's own calendar and time columns.

5. In `/pro` → **Offres**, open the **new promo** modal and its dropdowns.

**✔️ You must see** the same themed list on a dark modal.

> 🎯 **This is the whole check.** If you see a grey-and-blue system popup anywhere, that is a bug — report where.

### Step 3 — The sidebar at a short window

6. Resize the browser to roughly **800 px** tall.

**✔️ You must see** the full nav without scrolling. Shorter than that it scrolls, with a **thin themed scrollbar** — not the browser's thick grey one.

✅ **Check 12 done.**

---
---

# 💰 CHECK 13 — Commission is the server's, not the browser's

**Why this check exists.** The Finance screen used to let the organiser pick
their own commission plan from a row of buttons, compute the fee in the
browser, and store nothing. The number changed when you clicked a different
button and reset on reload. It matched no charge anyone would ever make.

### Step 1 — Look, but do not touch

Sign in as **organisateur@eventick.ma** → **FINANCES → Finance**.

- The plan is shown with a **padlock** and reads *"Offre attribuée par
  Eventick"* (or *"Offre par défaut"* if none is assigned). There is **no way
  to change it** — that is the point.
- Four figures across the top: **Recettes nettes**, **Remboursé**,
  **Commission Eventick**, **À reverser**.

### Step 2 — Assign a plan, as admin

Sign in as **admin@eventick.ma** → **ADMINISTRATION → Plateforme**. Each
organiser row has an **Offre** dropdown. Put the demo organiser on **Pro ·
3%**.

The response says, in effect, *"applies to orders settled from now on"*.

### Step 3 — Sell something, then check the fee

As a buyer, purchase a ticket from one of that organiser's events. Back on
**Finance**, the commission has grown by **3% of what you just spent**.

### Step 4 — The important part: history does not move

As admin, change the organiser to **Starter · 5%**. Return to **Finance**.

> ✅ The commission figure **does not change**. The fee was recorded on each
> order at the moment it was paid, so moving someone to a different rate
> cannot rewrite what they already owed. Only *later* sales use the new rate.

If that number moved, the fee is being recomputed on read — which is the bug
this design exists to prevent.

### Step 5 — A refund takes its commission with it

Refund half an order (**Réservations** → the order → refund half).

> ✅ **Recettes nettes** drops by the refund **and** the commission drops in
> proportion. An organiser must not pay a fee on a sale the buyer got their
> money back for.

---

# 🏦 CHECK 14 — Payouts: what is owed, and sending it

**Why this check exists.** Money reaches Eventick's CMI account, not the
organiser's, so their share has to be transferred separately. The dashboard
used to show a "Reversement" step that calculated nothing and recorded
nothing.

### Step 1 — Try to run a payout with no bank details

As admin → **Plateforme** → an organiser row → **Préparer un reversement**.

> ✅ Refused: *"no bank details on file"*. A pending payout nobody can
> actually send is worse than none — it reads as money already on its way.

### Step 2 — Add the RIB, as the organiser

**Finance → Coordonnées bancaires**. Try `123` first.

> ✅ *"Le RIB marocain comporte exactement 24 chiffres."*

Now enter 24 digits — spacing is fine, paste `1234 5678 9012 3456 7890 1234`.

> ✅ Saved, and only the **last four** come back (`**** 1234`). The full RIB is
> a payment credential; the earnings screen has no need for it.

### Step 3 — Run it

As admin → **Préparer un reversement**. The dialog shows **what is owed** and
how many orders. Dates default to the **last twelve months**.

> ✅ Created. The row reads `net = gross − commission − subscription`.

**On the subscription:** Pro is "3% + 499/month". The monthly part is withheld
here, once per calendar month **that had sales**. A dormant month is free.

### Step 4 — The guards

| What you do | What should happen |
|---|---|
| Run the same period again | *"Nothing to pay out"* — an order belongs to one payout, ever |
| Mark it paid with no reference | Refused — the row could not be reconciled against a bank statement |
| Mark it paid, then try again | Refused: already paid, and the first reference survives |
| Try to cancel a **sent** payout | Refused — a transfer that has gone cannot be un-sent by editing a row |
| Cancel a **pending** payout, then re-run | Works: its orders *and* its subscription months are released |
| Refund something already paid out | The payout's total **does not move** — it records money already sent |

### Step 5 — A month too quiet to cover its fee

If a month's revenue is less than the monthly subscription (say 194 MAD
against 499), the payout is **still created**: the fee takes what is there,
nothing is transferred, and the record exists.

> ⚠️ The shortfall is **not** carried forward as debt. That is a deliberate
> limit, not an oversight — see *Still open*.

---

# 📜 CHECK 15 — The journal, and removing an account

**Why this check exists.** Fourteen privileged routes could change a role,
grant a permission, refund money, assign a plan or send a payout, and none of
them left a record. *"It just changed"* is not an answer anyone can act on.

### Step 1 — Do something privileged

As admin, do any two of: change someone's role · grant a permission · refund
an order · assign a plan · send a payout.

### Step 2 — Read the journal

**ADMINISTRATION → Journal**.

> ✅ Each action appears with **your email**, **what changed — both ends**
> (`CUSTOMER → ORGANISER`, not just the result), and when.

Filter by action with the dropdown. Open the same screen as the **organiser**:

> ✅ Refused. The rows describe money and accounts across every organiser, so
> it is admin-only.

### Step 3 — Remove a fresh account

**Équipe** → create a throwaway account → remove it with the **bin** icon.

> ✅ The dialog says it will be **deleted permanently**. Afterwards the account
> is gone — but the **Journal still shows it existed and who removed it**.

That is the whole point: a cascade would have erased exactly the record worth
keeping.

### Step 4 — Remove an account that has bought something

Try to remove a customer **with orders**.

> ✅ The dialog says it will be **anonymised, not deleted**, because its
> payment history has to be kept.

Afterwards:

- The name reads *"Compte supprimé"*, the email is an opaque non-address.
- **The orders and tickets still exist** — the organiser was paid for them.
- The old credentials **no longer work**.

### Step 5 — The guards

| What you try | What should happen |
|---|---|
| Remove **your own** account | Refused — the platform can never reach zero admins |
| Remove **another admin** | Refused — one compromised admin must not clear out the rest |
| Remove anyone, as the organiser | Refused — `users.manage` only |

---

# 🗓️ CHECK 16 — Sales rules: who may buy, how many, and from when

> **The task:** an organiser needs three things a ticketing page cannot do without — a cap so one person cannot clear the tier, a date the sale opens, and a date it closes. All three existed in the API for a while with no way to set them; this is the screen that closes that gap.

### Step 1 — Set them while publishing

Header → **"Créer un événement"**. Fill the form as in check 6, then scroll to the new group **"Règles de vente"**.

| Field | Put in | What it means |
|---|---|---|
| **"Billets max par acheteur"** | `2` | Across *all* that buyer's orders, not per order. `0` means no limit |
| **"Autoriser la revente entre acheteurs"** | leave **unticked** | Resale is off unless asked for — that is check 18 |
| **"Fenêtre de vente"** → "Ouverture des ventes" | leave **empty** | Empty means on sale from publication |
| **"Fenêtre de vente"** → "Clôture des ventes" | leave **empty** | Empty means on sale until the event |

**✔️ You must see** the time pickers beside each date **greyed out and unclickable** until you pick a date. A time with no date would be a bound that is silently never sent, so the control refuses to pretend otherwise.

Pick an opening date now. **✔️ The time picker beside it becomes usable**, and a **"Réinitialiser"** link appears to clear the window again.

Tick **"Ajouter un tarif VIP"**. **✔️ A second "Fenêtre de vente VIP" appears** — the VIP tier gets its own window, because a VIP drop rarely opens when general sale does.

### Step 2 — An impossible window is refused

First notice you cannot create one by accident: pick an opening date, then open the closing picker. **✔️ Every day before the opening is greyed out and unclickable.**

So reach it the other way round — set the **closing** first, then move the **opening** to a later date. (Or set both to the same day and put the opening time after the closing time.) Press **"Publier sur l'agenda"**.

**✔️ You must see** *"La clôture doit être après l'ouverture."* and **no event is created**.

> This is checked in the browser as well as on the server on purpose. The server's message cannot say *which* window is wrong, and with a base tier and a VIP tier open at once that leaves you guessing.

Fix the dates and publish.

### Step 3 — Change the rules after the event exists

Pro → **CATALOGUE** → **Événements**. On your event's card, press the **sliders icon** (tooltip **"Règles de vente"**).

**✔️ The modal opens on the event's current values** — not on defaults. Change **"Billets max par acheteur"** to `1`, set **"Annulation possible jusqu'à (heures avant)"** to `24`, and **"Enregistrer"**.

Reopen it. **✔️ Both values are still there.**

> 💡 This was the real gap: the rules could be set at creation and then never changed again.

### Step 4 — The cap actually bites

Open your event on the public site and try to buy **3** tickets when the cap is `1`.

**✔️ You must see** the purchase refused, naming the limit. The cap counts every ticket that buyer already holds for the event — so buying one, then coming back for another, is refused too.

---

# 🚫 CHECK 17 — Calling an event off

> **The task:** an event gets cancelled. Every buyer must get their money back, every ticket must stop working, and the organiser must be told what actually happened — in one action, not four hundred.

> ⚠️ **Do this on an event you created**, not a seeded one. It refunds every buyer and cannot be undone.

### Step 1 — Sell something first

Buy a ticket or two on your test event (check 1). A cancellation with nothing to refund proves nothing.

### Step 2 — Find the action

Pro → **CATALOGUE** → **Événements** → your event's card → the **🚫 icon** (tooltip **"Annuler l'événement"**).

**✔️ If you are signed in as the organiser you see it.** It needs `finance.refund`, not `events.manage` — refunding every buyer at once is a bigger act than editing a listing, so someone trusted with the catalogue is not automatically trusted with this.

> To prove the gate: Pro → **ADMINISTRATION** → **Permissions**, turn **`finance.refund`** off for ORGANISER, reload **Événements**. **✔️ The icon is gone.** Turn it back on.

### Step 3 — Read what it says before agreeing

Press the icon.

**✔️ You must see** a modal spelling out the consequences in red:

> *"L'événement sort de la vente immédiatement. Chaque commande payée est remboursée, tous les billets sont annulés — y compris les invitations — et la liste d'attente est clôturée."*

Type a reason under 5 characters and submit. **✔️ Refused** — the reason is sent to buyers, so it cannot be empty or a keystroke.

Type a real reason: `Artiste malade, report impossible.` Leave **"Prévenir les acheteurs par e-mail"** ticked. Press **"Annuler l'événement"**.

**✔️ A second confirmation appears** — *"Cette action est irréversible."* Two deliberate yeses, because "cancel" on its own does not imply refunding every buyer.

> 💡 Press **Escape** on that confirmation. **✔️ The confirmation closes and the modal behind it stays open** — nothing is cancelled. Escape backs out; it never performs the action.

### Step 4 — What you are told

**✔️ You must see** a toast naming **how many orders were refunded and how much money went back** — for example *"1 commande(s) remboursée(s), 200,00 MAD rendus. Billets annulés."*

> It deliberately does **not** quote a ticket count. The server's `ticketsVoided` counts only the final sweep, and the refund has normally cancelled every ticket already — so that number is `0` in the ordinary case and reads as "nothing happened" on the one screen where you most need to know that it did.

If any refund failed, **✔️ a second orange warning** says how many need doing by hand, and stays on screen ten seconds. Those orders are still `PAID` in **Réservations**, so you can find and finish them.

### Step 5 — Everything is really off

| Where you look | What you must see |
|---|---|
| The event's card in **Événements** | A red **"Annulé"** badge, and the 🚫 icon **gone** — there is nothing left to cancel |
| The event on the public site | **404.** It is off sale, not merely hidden |
| **Réservations** | The order reads **REFUNDED**, full amount returned |
| The buyer's ticket page | The ticket is **CANCELLED** — it will not scan |
| Pro → **OPÉRATIONS** → **Porte**, scanning that ref | Refused |

---

# 🎁 CHECK 18 — Invitations: free tickets that are not a sale

> **The task:** give a journalist, a sponsor or the band's family a seat. Until now the only way was a 100 % promo code — and that is wrong in a way that matters: a promo code is a *discount on a sale*, so it lands in revenue, in the commission and in the payout as a zero-value order. A comp was never a sale.

### Step 1 — Open the panel

Pro → **CATALOGUE** → **Invitations** (new item, between *Placements* and *Offres*).

**✔️ You must see** the subtitle *"Billets offerts — jamais une vente, jamais une remise."* and an event switcher, because invitations belong to one event at a time.

### Step 2 — Issue a couple

Press **"Offrir des billets"**.

**✔️ The zone dropdown shows how many seats are left** in each — *"Carré · 12 restant"* — because a comp consumes capacity exactly as a sale does.

Fill the first guest: **"Nom de l'invité"** `Nadia Benali`, **"E-mail (optionnel)"** your own address. Press **"Ajouter un invité"** and fill a second with a name only, no email.

> A guest row left blank is dropped rather than sent — adding a row and not filling it in is a normal thing to do, and the server would reject the whole batch over it.

Press **"Offrir des billets"**.

**✔️ You must see** *"2 invitation(s) émise(s)."* and both guests in the table, each with a **ticket reference**. The one with an email shows **"Envoyé"**; the one without shows **"Non envoyé"** — pass that person the reference yourself.

Try a one-character name. **✔️ Refused** with *"Chaque nom doit faire au moins 2 caractères."*

### Step 3 — The part that matters: it is not revenue

| Where you look | What you must see |
|---|---|
| Pro → **CATALOGUE** → **Placements**, that zone | **2 fewer seats remaining** — capacity is consumed |
| Pro → **FINANCES** → **Finance** | Revenue **unchanged**, commission **unchanged** |
| Pro → **Réservations** | The comp orders exist at **0,00 MAD** |

> 💡 That is the whole reason invitations are their own concept rather than a promo code.

### Step 4 — The zone cannot be overbooked

Issue more invitations than the zone has seats left.

**✔️ Refused**, naming how many are actually left. Capacity is re-checked inside the transaction, so two people giving seats away at once cannot oversell between them.

### Step 5 — Revoking

Press the **🗑 icon** on a guest's row → confirm.

**✔️ You must see** *"Invitation annulée."* — and the guest **still on the list**, dimmed, with a red **"Annulée"** badge instead of a reference. The revoke icon is gone from that row.

> That is deliberate. *"Issued, then revoked"* is something an organiser wants to see; a row that vanishes looks like it never happened.

**✔️ Back in Placements, the seat has returned** to the pool.

### Step 6 — It is all in the journal

Pro → **ADMINISTRATION** → **Journal** (as admin).

**✔️ You must see** rows reading **"Invitations émises"** and **"Invitation annulée"**, with who did it. Free seats given away is exactly the kind of thing somebody asks about three months later.

---

# 🕒 CHECK 19 — A zone that is not on sale says so

> **The task:** a zone that refuses to sell is the most confusing thing an organiser can look at. If a sales window is holding it back, the screen should say which window and when.

### Step 1 — Put a window on an existing zone

Pro → **CATALOGUE** → **Placements**. Pick an event, then **✏️** on a zone.

Scroll to **"Fenêtre de vente"**. Set **"Ouverture des ventes"** to a date **next week** and save.

**✔️ The zone's card now carries an orange badge** reading **"Ouvre le …"** with that date.

### Step 2 — The other two states

| Set the window to | Badge you must see | Colour |
|---|---|---|
| Opens next week | **"Ouvre le …"** | orange |
| Opened yesterday, closes next week | **"En vente"** | green |
| Closed yesterday | **"Ventes closes"** | red |
| No dates at all | **no badge** | — |

> 💡 The badge appears **only when a window actually constrains the zone**. Marking every unconstrained zone "En vente" would be noise; the signal worth having is the one that is *not* selling, and why.

### Step 3 — Clearing a window

Reopen the zone, press **"Réinitialiser"** under the window, save.

**✔️ The badge is gone** and the zone sells normally again.

### Step 4 — The same guard as the event form

Set a closing date **before** the opening date and save.

**✔️ Refused** with *"La clôture doit être après l'ouverture."*

Now the subtler one: leave the closing date alone and move only the **opening** to after it. **✔️ Still refused** — the server checks the window you would *end up with*, not just the field you touched, so you cannot invert a window one field at a time.

### Step 5 — The buyer sees it too

Open the event on the public site while a zone is outside its window.

**✔️ That zone cannot be bought.** The sales window is enforced on the server at checkout, not merely drawn in the dashboard.

---

# ✅ Tick them off

| # | Check | Where to go | Done |
|---|---|---|---|
| 1 | **Buy with no account** | Public site → Explorer → checkout | ☐ |
| 2 | **The link's limits** | Ticket page → "Gérer ce billet" | ☐ |
| 3 | **Claim a guest order** | Ticket page → claim box → `/billets` | ☐ |
| 4 | **Give a ticket away** | Ticket page → "Offrir ce billet" | ☐ |
| 5 | **Gate scans once** | Pro → OPÉRATIONS → **Porte** | ☐ |
| 6 | **Publish an event** | Header → "Créer un événement" | ☐ |
| 7 | **Refunds and capability** | Pro → **Réservations** · **Permissions** | ☐ |
| 8 | **Become an organiser** | Header → "Créer un événement" as customer | ☐ |
| 9 | **Permission-driven sidebar** | Pro → ADMINISTRATION → **Permissions** | ☐ |
| 10 | **Platform console** | Pro → ADMINISTRATION → **Plateforme** | ☐ |
| 11 | **Three languages + RTL** | Account menu → **LANGUE** | ☐ |
| 12 | **Theme and no browser chrome** | Account menu → **"Passer en clair"** | ☐ |
| 13 | **Commission is server-side** | Pro → FINANCES → **Finance** | ☐ |
| 14 | **Payouts and the subscription** | Pro → ADMINISTRATION → **Plateforme** | ☐ |
| 15 | **Journal and account removal** | Pro → ADMINISTRATION → **Journal** · **Équipe** | ☐ |
| 16 | **Sales rules: cap and windows** | "Créer un événement" → **"Règles de vente"** | ☐ |
| 17 | **Calling an event off** | Pro → **Événements** → 🚫 icon | ☐ |
| 18 | **Invitations are not a sale** | Pro → CATALOGUE → **Invitations** | ☐ |
| 19 | **A closed zone says so** | Pro → CATALOGUE → **Placements** | ☐ |

---

# 🤖 What the automated testing covers

Every check above runs against the live app before each release.

Last full run: **every suite green, zero failures**, against fresh servers and
a seeded database.

| Suite | Command | What it proves | Result |
|---|---|---|---|
| `vitest` | `npm test` | commission, pricing, inventory, ticket refs, the CMI hash | **123 / 123** |
| `live-api-test` | `npm run test:live` | the API surface end to end | **123 / 123** |
| `live-authz-test` | `npm run test:live:authz` | who may reach what, across roles | **54 / 54** |
| `live-guest-authz-test` | `npm run test:live:guest` | the boundary around a guest's link | **38 / 38** |
| `live-organiser-authz-test` | `npm run test:live:organiser` | each organiser capability is really enforced | **16 / 16** |
| `live-coverage-test` | `npm run test:live:coverage` | the routes the other suites do not reach | **72 / 72** |
| `live-orders-payments-test` | `npm run test:live:orders` | hold → pay → settle → refund → resell → commission → payout | **79 / 79** |
| `live-audit-test` | `npm run test:live:audit` | the journal, and the two ways an account is removed | **46 / 46** |
| `live-money-test` | `npm run test:live:money` | commission and payout rules on their own | all pass |
| `live-cmi-payment-test` | `npm run test:live:cmi` | the gateway: forged, tampered and late callbacks | **20 / 20** ¹ |
| `live-share-test` | `npm run test:live:share` | giving a ticket away, and revoking the link | all pass |
| `live-refund-webhook-test` | `npm run test:live:refund` | a back-office refund voids the tickets | all pass |
| `live-sweeper-test` | `npm run test:live:sweeper` | lapsed holds release their seats | all pass |
| `live-ticketing-test` | `npm run test:live:ticketing` | the buyer cap, sales windows, cancellation and comps — checks 16–19 | **32 / 32** |
| `live-frontend-test` | `npm test` *(in `frontend/`)* | every API call the UI makes, through the Next.js proxy | **176 / 176** |

¹ Skips cleanly unless `CMI_CLIENT_ID`/`CMI_STORE_KEY` are set — the callback is
signature-verified, so there is nothing to test without a key.

```bash
# Everything, with both servers up. From backend/:
npm test                     # unit
npm run test:live            && npm run test:live:authz \
  && npm run test:live:organiser && npm run test:live:guest \
  && npm run test:live:coverage  && npm run test:live:share \
  && npm run test:live:sweeper   && npm run test:live:refund \
  && npm run test:live:money     && npm run test:live:orders \
  && npm run test:live:audit     && npm run test:live:ticketing

# And from frontend/:
npm test
```

> ⚠️ **Two rate limiters will fail a long run, and it is not a real defect.**
> Sign-in is 10 per 15 minutes and organiser broadcast is 6 per hour; both are
> held **in memory, per process**, so running every suite back to back exhausts
> them and you see `429` where you expected `400` or `403`. **Restarting the
> backend clears both** — or raise `AUTH_RATE_LIMIT_MAX` and
> `BROADCAST_RATE_LIMIT_MAX` in `backend/.env` for the duration.

> 💡 **Suites clean up after themselves, including when they fail.** The money
> and orders suites purge their own leftovers at startup as well as at the end.
> That matters: a payout correctly sweeps up *every* unpaid order in its
> period, so one crashed run used to leave an order behind that made the *next*
> run fail for an unrelated reason.

### Defects these checks caught, and that are now fixed

1. **A guest could cancel, resell or give away any ticket** they had the id for — no token, no account. *(Check 2.)*
2. **The "Offrir ce billet" button silently failed** for guests: the frontend never sent the credential it had. *(Check 4.)*
3. **`finance.view` and `finance.refund` were enforced nowhere.** The toggles existed and did nothing — revenue stayed readable and refunds possible with both off. *(Check 7.)*
4. **Paying bounced the buyer to the catalogue** instead of the confirmation page, so a successful purchase looked like a failure. *(Check 1.)*
5. **"Créer un événement" was a dead end** for customers — a silent redirect to the homepage. *(Check 8.)*
6. **Any admin could mint another admin**, by creation or promotion. Now only the seed can. *(Check 9.)*
7. **The order id was treated as a credential**, exposing the buyer's name, email and phone to anyone with the link. *(Check 2.)*
8. **The commission was a browser calculation.** The organiser chose their own plan, `planCost()` ran client-side, and nothing was stored — so the fee changed on a click and reset on reload. *(Check 13.)*
9. **Revenue counted refunded money as earnings,** and charged commission on it. A fully refunded order vanished from the figure; a partially refunded one stayed at full value. *(Check 13.)*
10. **A resale earned the platform nothing.** Both resale settlement paths bypassed the one place commission was recorded, so Eventick brokered the sale, moved the seat, refunded the seller and took 0.00 MAD. *(Check 14.)*
11. **A quiet month refused its own payout.** 485 MAD of revenue against a 499 MAD subscription produced *"nothing to transfer"*, so over a 14 MAD shortfall the organiser got neither the money nor a record. *(Check 14, step 5.)*
12. **A CMI payment arriving after the hold lapsed** either took the money and issued nothing, or issued a ticket for a seat already resold. *(Covered by `live-cmi-payment-test`.)*
13. **Nothing recorded who did what.** Role changes, permission grants, refunds, plan assignments and payouts all happened silently. *(Check 15.)*
14. **A declined CMI payment could never be retried.** The gateway reference was the bare order id, so CMI refused the second attempt as an "ongoing transaction" and the buyer was stuck. Each attempt now carries its own suffix. *(Covered by `live-cmi-payment-test`.)*
15. **Five capabilities existed only in the API.** The buyer cap, resale switch, sales windows, event cancellation and comp tickets were all reachable by `curl` and by nothing else — an organiser had to accept the defaults forever. *(Checks 16–19.)*
16. **A zone could be created with a sales window that never opens.** `POST /tiers` accepted a window closing before it opened — a 201 and a zone that could never sell — while `PATCH` on the same field correctly refused it. *(Check 19, step 4.)*
17. **The sales-rules modal showed `undefined` as its labels.** The four copy keys went into the buyer-side dictionary instead of the dashboard one. A missing key is not a build error, so it rendered the word "undefined" in all three languages. *(Check 16, step 3.)*
18. **Escape closed the modal underneath a confirm dialog.** Cancelling an event is the only place that raises a confirmation from inside an open modal; both listened for Escape, and the modal answered first — leaving the confirmation floating over nothing. Escape could never *perform* the cancellation. *(Check 17, step 3.)*

---

# ❓ If something looks odd

| What you see | Why |
|---|---|
| **"Trop de tentatives"** on sign-in | 10 sign-ins / 15 min for the whole machine. Wait, or restart the backend. |
| Event names stay in French on the public site | They are database records with both languages — switch the interface to see Arabic |
| Some error messages appear in French | Server messages are not translated; the interface is |
| The ticket PDF is French even in Arabic | Deliberate — the PDF engine cannot shape Arabic text |
| A confirmation link shows nothing in another browser | Correct. The token is the credential; without it there is no access |
| **"Annuler et me faire rembourser"** is missing | You are not signed in. That is check 2 |
| An event cannot be deleted | It has orders. Hide it instead — the history is real |
| The admin appears in "Qui vend" | Correct — it owns the 14 seeded events. The row shows its role |
| A floating **"N"** on the left edge | The Next.js dev indicator. Dev-only, never in production |
| **"Ce billet est déjà entré"** at the gate | Correct — one ticket, one entry |
| Seats "disappear" mid-test | Holds last 15 minutes. An abandoned checkout releases them |
| The plan on **Finance** has a padlock and cannot be changed | Correct. An admin assigns it — an organiser choosing their own rate was the bug |
| Changing a plan does not change the commission shown | Correct, and the point. The fee was recorded when each order was paid; only later sales use the new rate |
| A payout deducted **499 MAD** you were not expecting | The plan's monthly subscription, withheld once per calendar month that had sales. Starter is 0 |
| A second payout for the same month deducts **nothing** | Correct — the subscription is charged once per month, however many runs cover it |
| A payout nets **0.00** but still exists | That month's revenue did not cover its subscription. The fee took what was there; the record exists so the month is not billed twice |
| **"no bank details on file"** when running a payout | The organiser has not entered a RIB. A payout nobody can send reads as money already on its way |
| Only `**** 1234` comes back after saving a RIB | Deliberate. The full RIB is a payment credential; the screen showing earnings does not need it |
| A removed account still appears in the **Journal** | Correct, and the reason the journal exists — the record outlives the account |
| Removing an account says **"anonymised"**, not deleted | It has orders. They must survive, so the row stays with its personal data stripped |
| **429** instead of 400/403 while running the test suites | A rate limiter, not a defect. See the warning under *What the automated testing covers* |
| A zone shows **"Ouvre le …"** or **"Ventes closes"** | Its sales window is holding it back. The badge only appears when a window actually constrains the zone |
| A zone with no sales window shows **no badge at all** | Correct. Marking every unconstrained zone "En vente" would be noise — the useful signal is the one *not* selling |
| The time picker beside a sales date is **greyed out** | Pick the date first. A time with no date would be a bound that is silently never sent |
| **"Annuler l'événement"** (🚫) is missing from an event card | Either you lack `finance.refund`, or the event is already cancelled — there is nothing left to refund |
| Cancelling says **"Billets annulés"** without a number | Deliberate. The server's ticket count only covers the final sweep, and the refund has normally voided them already — so it reads `0` when everything worked |
| A **revoked invitation is still on the list** | Correct, and the point. "Issued, then revoked" is what the organiser needs to see; a row that vanishes looks like it never happened |
| An invitation consumed a seat | Correct. A comp takes capacity exactly like a sale — it just never becomes revenue |
| Revenue did **not** move after issuing invitations | Correct, and the whole reason comps are not a 100 % promo code |
| **"Publier"** refuses with *"La clôture doit être après l'ouverture"* | One of your sales windows closes before it opens. The base tier and the VIP tier have separate windows |

---

# ⚠️ Still open (not failures of the checks above)

Two kinds of thing are listed here, and the difference matters. **Deliberate
limits** are decisions with a reason — leave them alone unless the reason
changes. **Actual gaps** are work not done yet.

### Deliberate limits

- **Payments default to simulated.** With no `CMI_CLIENT_ID`/`CMI_STORE_KEY` no card is charged. The CMI integration itself is complete — signed redirect, hash-verified callback, replay-safe settlement — but it needs real merchant credentials to exercise, and production refuses to boot without them.
- **Refunds do not move money.** CMI has no refund API: `/organiser/orders/:id/refund` records the refund, voids the tickets and emails the buyer, but someone must then reverse the transaction by hand in the CMI back office. Use `/organiser/orders/:id/reconcile-refund` to sync the books after a reversal made there, since CMI notifies us of nothing.
- **A refused late payment leaves the order PENDING, not CANCELLED.** When the seats are gone the server declines the money and stops; the sweeper tidies the order up on its next pass (within five minutes). Nothing is charged in the meantime, but the order looks unpaid rather than explicitly failed until then.
- **Commission and subscription are withheld, not invoiced.** Both are real and computed server-side — the percentage is written onto each order when it settles, the monthly fee is charged per calendar month that had sales — but Eventick never issues an invoice or takes a card. Both are collected by being deducted from the payout, so an organiser with no payout due is never charged.
- **A dormant month is not billed, and no debt accrues.** If a month's sales do not cover the plan's monthly fee, the shortfall is simply not collected rather than carried forward. Charging it would mean a debt model, which is a bigger decision than the payout run should make.
- **Payouts are a ledger, not a bank integration.** A run calculates what is owed and records the transfer, but nobody sends money automatically: an admin makes the transfer in their bank and pastes the reference back in. There is no bank API.
- **The journal records decisions, not everything.** Role changes, permission grants, refunds, plan assignments, payouts and account removal are recorded. Ordinary reads and CRUD are deliberately not: a log of everything is one nobody reads.
- **An account with money history is anonymised, not deleted.** Its orders, tickets and payouts have to survive — the organiser was paid for them — so the row stays with its personal data stripped. A true erasure would mean rewriting financial records.

### Actual gaps

- **The demo accounts use public passwords.** They are printed in this guide and in the seed. Change them before anything is deployed.
- **`NEXT_PUBLIC_SITE_URL` must be set to the real domain before launch.** It drives every canonical URL, `og:url` and sitemap entry. Left at its `http://localhost:3100` default, the sitemap advertises localhost to Google and the canonicals point somewhere unreachable — the site looks finished while being worse than before. Set it per environment in `frontend/.env.local`, then submit `https://<domain>/sitemap.xml` in Search Console (that part is manual; it needs domain ownership).
- **Event structured data is built, and switched off.** `Event.seoIndexable` defaults to **false**, so no event carries schema.org `Event` markup until someone marks it real. All 16 seeded events are false, which is why the demo catalogue emits none. Flip it per event once an event is genuinely bookable — markup describing an unbookable event risks a penalty against the whole domain, not merely a missing rich result. (`WebSite`/`Organization` markup is unconditional: it makes no claim about any event.)
  - That flag is also what drives the demo-catalogue notice: while **no** event is marked real, every public page carries a banner saying the events and prices are examples. Publish one real event and the banner disappears by itself.
- **One language, one URL.** Switching language does not change the URL, so Google sees a single French page rather than three. `/fr/ /en/ /ar/` prefixes with `hreflang` are the fix.
  - **French and Arabic are ready.** All 16 events carry real Arabic copy — `titleAr` differs from `titleFr` on every row, and no Arabic field is empty — so `/fr/` and `/ar/` would be genuine alternates, not duplicates.
  - **English is not.** There are no English event columns, so an indexable `/en/` would serve French text under an hreflang promising English.
  - **Deliberately held until CMI works.** The gateway's return URLs are built server-side (`backend/src/lib/cmi.ts`: `okUrl` → `/confirmation/:orderId`, `failUrl` → `/paiement?echec=1`) and know nothing about a locale prefix. A react-router `basename` does not cover them, so adding prefixes means editing the live money path — and that path cannot be tested end to end while no CMI test card works. Sequence it after the gateway, not before.
- **No city or category landing pages.** `/explorer?cat=…&ville=…` filters client-side, so there is nothing for a crawler to index per city. Real pages are worth building, but 8 cities × 6 categories over 16 events would be mostly empty — thin pages that spend crawl budget. Worth revisiting once the catalogue is real.
- **Nothing purges the journal.** It only grows. Fine for now; it needs a retention policy before it is years old.
- **No bank integration.** A payout records what is owed and who sent it, but an admin makes the transfer by hand — see *Payouts are a ledger* above.
- **CMI is unexercised against real money.** The integration is complete and tested against a signed stand-in for the gateway, and verified against the real test gateway — our hash was reproduced byte-for-byte from CMI's own retry form, which confirms the key, the algorithm and the merchant id. What is still missing is a card: no test card supplied so far is provisioned for merchant `600002996`, and CMI answers `HOST based messaging problem (99)`, which is its gateway failing to reach the issuing bank rather than anything in this code.
- **A sales window is wall-clock, read as UTC.** The window you type is stored exactly as typed and compared the same way, which keeps it consistent with the event's own start time. Morocco is UTC+1, so a window typed as `00:00` is not midnight local. Fine while both are naive; it needs real timezone handling before selling across timezones.
- **No UI shows a buyer *why* a zone is unavailable.** The dashboard says "Ouvre le …" and the server refuses the purchase, but the public event page does not yet explain that a tier opens later — it simply cannot be bought. *(Check 19, step 5.)*

Only the items under **Actual gaps** need work before going live. The
deliberate limits are documented here so nobody mistakes them for bugs — and
so a future change that wants to revisit one knows what it is arguing with.
