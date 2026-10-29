# CMI test session — live right now

Everything is configured and running. **One step is yours** (step 1), because
CMI does not issue the store key — you set it.

---

## ⚠️ Step 1 — set the store key in the CMI back office

This is the only blocker. The onboarding email says so explicitly:
*"Vous êtes appelés à renseigner la clé à travers votre espace back office."*

1. Open **https://testpayment.cmi.co.ma/cmi/report**
2. Merchant **600001388** · user **mtzon_a** · password **Mtzon_a2020**
   *(it will force a password change on first login)*
3. Go to **Administration → Changer les clés du magasin**
4. Set the key to exactly:

```
Eventick2026Cmi
```

That value is already in `backend/.env`. If you prefer a different key, change
it in **both** places — they must match character for character, or CMI
rejects every payment with `INVALID_HASH`, which looks like a code bug.

---

## What is already set up

| Piece | Value |
|---|---|
| Merchant id | `600001388` |
| Gateway | `https://testpayment.cmi.co.ma/fim/est3Dgate` |
| Store key (in `.env`) | `Eventick2026Cmi` |
| Public callback | `https://circumstances-bean-league-innovative.trycloudflare.com/api/webhooks/cmi` |
| Backend | `http://localhost:4100` — CMI mode, **not** mock |
| Frontend | `http://localhost:3100` |

Verified: the callback URL is reachable from the public internet, and an
unsigned POST to it is correctly refused with `FAILURE`.

> ⚠️ The tunnel hostname **changes every time cloudflared restarts**. If the
> callback stops arriving, that is the first thing to check — see *Restarting
> the tunnel* below.

---

## Step 2 — buy a ticket in the browser

1. Open **http://localhost:3100**
2. Pick an event → choose a tier → **Réserver**
3. Fill in name, email, phone (`0612345678` works) → submit
4. You now see **"Payer … sur CMI"** instead of instant settlement

   *(This is the deliberate design: an auto-submitting page flashes and jumps
   exactly when someone is about to type a card number.)*

5. Click it. You land on **CMI's own 3-D Secure page** — a different domain,
   their branding. Your card number never touches Eventick.
6. Pay with a test card from the **certification-test file inside the
   integration kit** (download auth `kitmtc` / `AK16M9`). The cards are not in
   the email.
7. You return to `/confirmation/<order-id>` and should see your ticket.

---

## Step 3 — what to verify

| Where | What should be true |
|---|---|
| The CMI page | A different domain, their branding, your card typed there |
| After paying | You land on the confirmation page with a ticket |
| `/billets` | The ticket is listed, with a QR |
| Pro → Réservations | The order reads **PAID** |
| Pro → Finance | Revenue went up, and so did the commission |

**The callback is what issues the ticket.** If you land on the confirmation
page but see no ticket, the payment succeeded at CMI and the callback did not
arrive — check the tunnel.

---

## Watching it happen

```bash
# The callback arriving, and what the server decided
tail -f "C:/Users/abdel/AppData/Local/Temp/claude/c--Users-abdel-OneDrive-Desktop-Storeino-Eventick/67468aa1-7949-4801-94d7-279aa4ed8da3/scratchpad/backend.log" | grep -i cmi
```

What you want to see: `CMI payment settled`.

What a key mismatch looks like: `CMI callback REJECTED — hash mismatch`.
That means the back-office key and `.env` disagree.

---

## Restarting the tunnel

The quick tunnel has no uptime guarantee and gets a new hostname each time.

```bash
cd "C:/Users/abdel/AppData/Local/Temp/claude/c--Users-abdel-OneDrive-Desktop-Storeino-Eventick/67468aa1-7949-4801-94d7-279aa4ed8da3/scratchpad/tools"
./cloudflared.exe tunnel --url http://localhost:4100 --no-autoupdate
```

Take the new `https://…trycloudflare.com` URL, put it in `CMI_CALLBACK_URL` in
`backend/.env`, and **restart the backend** — `tsx watch` only watches `src/`,
so an `.env` change needs a restart.

---

## ⚠️ While CMI is live, most test suites cannot pass

This is expected, not a defect. With CMI configured, `POST /orders/:id/pay`
returns a **redirect form** instead of settling the order — so every suite
that buys a ticket and expects an instant ticket stops partway:

| Suite | In CMI mode |
|---|---|
| `test:live:cmi` | **passes** — it signs its own callbacks |
| `vitest` | **passes** — pure logic, no gateway |
| `test:live:orders`, `money`, `share`, `coverage`, `refund`, `frontend` | stop at the first purchase |

So: **test CMI in the browser, then switch back to mock mode to run the
suites.** Do not read a `harness error` in CMI mode as a regression.

## Going back to mock mode

The other tests and the 15 guide checks expect instant settlement:

```bash
cd backend
cp .env.before-cmi .env   # the pre-CMI file, saved before any changes
# then restart the backend
```
