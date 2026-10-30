# Enabling CMI payments on `eventick.speedliv.com`

**Written for: the DevOps engineer who owns the `eventick.speedliv.com` deploy.**
You do not need to know the application. Everything below is server-side
configuration plus one redeploy.

---

## TL;DR

1. **Redeploy the backend from `origin/main` (`d3e8062`).** The running build
   is older and is missing the payment callback endpoint entirely.
2. **Set five environment variables** on the backend (listed below).
3. **Confirm `POST /api/webhooks/cmi` answers `200`, not `404`.** That single
   check is the whole acceptance test.

---

## The blocker, precisely

`POST https://eventick.speedliv.com/api/webhooks/cmi` currently returns:

```
HTTP/1.1 404 Not Found
{"error":"Not found"}
```

It must return `200`. The same request against a current build returns `200`.

**This is not a proxy or nginx problem.** The 404 carries the application's own
`helmet` security headers and its own JSON error body, so the request reaches
Node — Node simply has no such route. The route is present and mounted on
`origin/main`:

- `backend/src/routes/webhooks.ts` — defines `POST /cmi`
- `backend/src/app.ts` — `app.use("/api/webhooks", webhooksRouter)`, unconditional

Other endpoints on the box respond normally (`/api/events` → 200,
`/api/orders/hold` → 400, `/api/ready` → `{"ok":true,"db":"up"}`), so the
service is healthy. It is just running code from before this endpoint existed.

**Why it matters:** the callback is the *only* thing that turns a payment into
a ticket. The buyer's browser is deliberately not trusted to confirm payment —
it can close the tab or lose its connection right after paying. If this
endpoint 404s, CMI takes the customer's money and **no ticket is ever issued.**
That failure is silent from the buyer's side until they check their tickets.

---

## Environment variables

Set these on the **backend** service, then restart it.

| Variable | Value | Notes |
|---|---|---|
| `CMI_CLIENT_ID` | *(merchant id)* | Presence of this is what switches the app out of mock mode |
| `CMI_STORE_KEY` | *(store hash key)* | **Not issued by CMI.** Set by us in the CMI back office under *Administration → Changer les clés du magasin*. Must match character for character |
| `CMI_GATEWAY_URL` | `https://testpayment.cmi.co.ma/fim/est3Dgate` | Test gateway. Production is a different host |
| `CMI_CALLBACK_URL` | `https://eventick.speedliv.com/api/webhooks/cmi` | Must be publicly reachable from CMI's servers |
| `PUBLIC_APP_URL` | `https://eventick.speedliv.com` | Builds the buyer's return URLs |
| `PUBLIC_API_URL` | `https://eventick.speedliv.com` | Falls back to building `CMI_CALLBACK_URL` if that is unset |

Ask the application owner for the two secret values — they are not in the
repository, and `backend/.env` is gitignored by design.

> **`CORS_ORIGINS`** already appears correct: the deployed API returns
> `access-control-allow-origin: https://eventick.speedliv.com`. No change needed.

### Behaviour when unset

With `CMI_CLIENT_ID` absent the app runs in **mock mode**: checkout settles
instantly without a gateway. Useful for testing everything *except* payment,
and it is what the automated suites rely on. A production deploy must not run
in mock mode — it would issue tickets without taking money.

The callback endpoint is safe either way. An unconfigured server answers a
callback with `FAILURE` rather than settling, so a mock build facing the
internet cannot be used to mint free tickets.

---

## Verifying the deploy

**1. The endpoint exists** — the one check that matters:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://eventick.speedliv.com/api/webhooks/cmi
# 404 = old build, still broken
# 200 = correct
```

A bare POST like this is *expected* to be refused by the application (no valid
signature). You are confirming the route exists, not that it accepts anything.

**2. CMI mode is active** — sign in and start a purchase:

```bash
TOKEN=$(curl -s -X POST https://eventick.speedliv.com/api/auth/login \
  -H 'content-type: application/json' \
  --data-raw '{"email":"<test account>","password":"<password>"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['token'])")
```

> Ask the application owner for a working test account on this environment.
> `camille@client.test` was tried and the API answered
> `{"error":"Invalid email or password"}`, so that one is not valid here.

Then hold a seat and call `POST /api/orders/:id/pay`. The response must read:

```json
{"mode":"cmi","action":"https://testpayment.cmi.co.ma/fim/est3Dgate","fields":{…}}
```

If it reads `{"mode":"mock","settled":true}`, the environment variables did not
reach the process — a service reads its environment once at boot.

**3. End to end in a browser:** buy a ticket, pay on CMI's page, and confirm a
ticket is issued. Landing on the confirmation page with **no ticket** means the
payment succeeded at CMI and the callback never arrived — check the endpoint
and the backend log for `CMI callback`.

---

## Reading the logs

The backend logs every callback outcome. Grep for `cmi`:

| Log line | Meaning |
|---|---|
| `CMI payment settled` | Worked — order paid, ticket issued |
| `CMI callback REJECTED — hash mismatch` | `CMI_STORE_KEY` does not match the key set in the CMI back office |
| `CMI callback REJECTED — wrong merchant id` | `CMI_CLIENT_ID` disagrees with the merchant that signed |
| `CMI callback received but CMI is not configured` | The env vars are not reaching the process |

A hash mismatch looks like an application bug and is not one — it is almost
always the store key.

---

## Two things worth knowing

**Replays are safe.** CMI may deliver the same callback more than once. The
second delivery accepts the money and issues no second ticket. This is covered
by tests; no action needed.

**Refunds do not move money.** CMI has no refund API. The application records
the refund, voids the ticket and emails the buyer, but someone must reverse the
transaction by hand in the CMI back office. Not a deploy concern — flagged so
it is not discovered during an incident.

---

## Open item, not a deploy blocker

Payment has **not yet been completed end to end against the real gateway**, on
any environment. The integration is verified against signed stand-in callbacks
— signature verification, tampering, replay and decline all pass — and our hash
was reproduced byte-for-byte from CMI's own retry form, which confirms the key,
the algorithm and the merchant id are right.

What is missing is a working test card. No card tried so far is provisioned for
the merchant in use, and CMI answers `HOST based messaging problem (99)` —
their gateway failing to reach the issuing bank, not a fault in this code.

Test cards ship inside CMI's downloadable integration kit, not in the
onboarding email. **Obtaining a provisioned card is the remaining dependency**,
and it is on CMI, not on this deploy. Do the redeploy and configuration
regardless — they are prerequisites either way.
