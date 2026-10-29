# 🎟️ Eventick — hands-on test guide

**Twelve checks. Do them in any order.** Every step says exactly where to click and what you must see.

> 📅 29/10/2026 · Written by walking the running app at **http://localhost:3100**. The interface ships in **French**; every label in quotes below is the text actually on screen. Switch to English from the account menu if you prefer — the checks work the same.

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

---

## 🧭 Where things are

**Public site** — Explorer · event pages · checkout · your tickets
**Dashboard** (`/pro`) — the sidebar is grouped under small grey headings. Paths below are written as **group → item → button**.

| Group | Items | Who sees it |
|---|---|---|
| **PILOTAGE** | Pilotage · Réservations | organiser + admin |
| **CATALOGUE** | Événements · Placements · Offres | organiser + admin |
| **OPÉRATIONS** | Porte | organiser + admin |
| **FINANCES** | Finance | organiser + admin |
| **ADMINISTRATION** | Plateforme · Équipe · Permissions | **admin only** |

> 💡 The group headings are labels, not buttons — click the item under them.
> 💡 **The sidebar is permission-driven.** An item you cannot use does not appear at all. That is check 9.

### What already exists

**17 events** across Casablanca, Rabat, Marrakech, Tanger, Agadir, Essaouira, Fès and Dakhla
**Promo codes:** `SAFRAN15` (−15 %) and `CASA50` (−50 MAD)
**Rules:** seats are held **15 minutes** · buyers may cancel up to **48 h** before the event

> 🔄 **To start clean:** `cd backend && npx prisma migrate deploy && npm run db:seed`

---
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

---

# 🤖 What the automated testing covers

Every check above runs against the live app before each release.

| Suite | What it proves | Result |
|---|---|---|
| `live-frontend-test` | every API call the UI makes, through the Next.js proxy | **176 / 176** |
| `live-api-test` | the API surface end to end | **123 / 123** |
| `live-authz-test` | who may reach what, across roles | **54 / 54** |
| `live-guest-authz-test` | the boundary around a guest's link | **38 / 38** |
| `live-organiser-authz-test` | each organiser capability is really enforced | **16 / 16** |
| `vitest` | pricing, inventory and ticket-reference maths | **49 / 49** |

```bash
# Run them (both servers must be up)
node scripts/live-frontend-test.mjs
node scripts/live-guest-authz-test.mjs
cd backend && npm run test:live && npm run test:live:authz && npm run test:live:organiser && npm test
```

> ⚠️ Running several suites back to back exhausts the **10 sign-ins / 15 min** limit and you will see `429` failures that are not real. Restart the backend between runs, or raise `AUTH_RATE_LIMIT_MAX` in `backend/.env` temporarily.

### Defects these checks caught, and that are now fixed

1. **A guest could cancel, resell or give away any ticket** they had the id for — no token, no account. *(Check 2.)*
2. **The "Offrir ce billet" button silently failed** for guests: the frontend never sent the credential it had. *(Check 4.)*
3. **`finance.view` and `finance.refund` were enforced nowhere.** The toggles existed and did nothing — revenue stayed readable and refunds possible with both off. *(Check 7.)*
4. **Paying bounced the buyer to the catalogue** instead of the confirmation page, so a successful purchase looked like a failure. *(Check 1.)*
5. **"Créer un événement" was a dead end** for customers — a silent redirect to the homepage. *(Check 8.)*
6. **Any admin could mint another admin**, by creation or promotion. Now only the seed can. *(Check 9.)*
7. **The order id was treated as a credential**, exposing the buyer's name, email and phone to anyone with the link. *(Check 2.)*

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

---

# ⚠️ Still open (not failures of the checks above)

- **Payments default to simulated.** With no `CMI_CLIENT_ID`/`CMI_STORE_KEY` no card is charged. The CMI integration itself is complete — signed redirect, hash-verified callback, replay-safe settlement — but it needs real merchant credentials to exercise, and production refuses to boot without them.
- **Refunds do not move money.** CMI has no refund API: `/organiser/orders/:id/refund` records the refund, voids the tickets and emails the buyer, but someone must then reverse the transaction by hand in the CMI back office. Use `/organiser/orders/:id/reconcile-refund` to sync the books after a reversal made there, since CMI notifies us of nothing.
- **The commission is not real.** On **Finance**, the organiser picks their own plan and the fee is computed in the browser — nothing is stored and nothing is charged. The backend has no concept of a plan.
- **There are no payouts.** The Pilotage board shows a "Reversement" step, but there is no bank detail, no payout run and no record of a transfer.
- **No audit trail.** Role changes, permission grants, refunds and deletions are not recorded anywhere. Only organiser-application decisions keep a record.
- **No delete-user endpoint.** The Équipe screen cannot remove an account.
- The demo accounts use public passwords and must be changed before production.

These should all be addressed before going live.
