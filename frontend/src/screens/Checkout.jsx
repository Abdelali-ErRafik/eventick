import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "../components/Shell";
import StripeForm from "./StripeForm";
import { api, money } from "../api";
import { useCart } from "../CartContext";
import { useAuth } from "../AuthContext";
import { useI18n } from "../i18n";
import { emailOk, phoneOk } from "../payment";

export default function Checkout() {
  const { locale, t, tf } = useI18n();
  const { cart, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const filled = useRef(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState({});
  const [now, setNow] = useState(0);
  const [promo, setPromo] = useState("");
  const [promoOn, setPromoOn] = useState("");
  const [discountCents, setDiscountCents] = useState(0);

  const [payment, setPayment] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cart) {
      navigate("/explorer");
      return;
    }
    api.get(`/events/${cart.eventSlug}`).then((data) => setEvent(data.event));
  }, [cart, navigate]);

  useEffect(() => {
    if (filled.current || !user) return;
    filled.current = true;
    setName(user.name ?? "");
    setEmail(user.email ?? "");
  }, [user]);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // The countdown is the server hold created when they pressed Book.
  const holdUntil = cart?.holdUntil ?? null;

  useEffect(() => {
    if (!holdUntil || !now) return;
    if (Date.parse(holdUntil) > now) return;
    clear();
    toast.error(t("holdExpired"));
    navigate("/explorer");
  }, [holdUntil, now, clear, navigate, t]);

  // A buyer who leaves before paying shouldn't sit on seats for 15 minutes.
  const heldId = cart?.orderId ?? null;
  const settled = Boolean(payment?.settled);
  useEffect(() => {
    if (!heldId || settled) return;
    // Must be api.del, not sendBeacon: sendBeacon only ever issues POST, so
    // it 404s against this DELETE route — and since it returns true on
    // *queueing* rather than on a 2xx, an `||` fallback never runs. That bug
    // meant abandoned carts held their seats for the full 15 minutes.
    const release = () => {
      api.del(`/orders/hold/${heldId}`, { keepalive: true }).catch(() => {});
    };
    window.addEventListener("pagehide", release);
    return () => window.removeEventListener("pagehide", release);
  }, [heldId, settled]);

  const onPayError = useCallback(
    (message) => {
      toast.error(message);
    },
    [],
  );

  if (!cart || !event) {
    return (
      <Shell>
        <div className="mx-auto h-80 max-w-3xl animate-pulse px-4 py-10" />
      </Shell>
    );
  }

  const lines = cart.lines
    .map((line) => {
      const tier = event.tiers.find((item) => item.id === line.tierId);
      if (!tier) return null;
      const qty = Math.min(line.qty, tier.remaining);
      return qty > 0 ? { tier, qty } : null;
    })
    .filter(Boolean);

  if (lines.length === 0) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-extrabold">{t("emptyPay")}</h1>
          <Link to="/explorer" className="mt-6 inline-flex h-12 items-center rounded-full bg-lagon px-5 font-semibold text-foam">
            {t("backEvents")}
          </Link>
        </div>
      </Shell>
    );
  }

  const total = lines.reduce((sum, line) => sum + line.qty * line.tier.priceCents, 0);
  const due = total - discountCents;

  const applyPromo = async (e) => {
    e.preventDefault();
    try {
      const result = await api.get(`/events/${event.slug}/quote-promo?code=${encodeURIComponent(promo)}&subtotalCents=${total}`);
      if (!result.valid) {
        setPromoOn("");
        setDiscountCents(0);
        toast.error(t("promoBad"));
        return;
      }
      setPromoOn(promo.trim());
      setDiscountCents(result.discountCents);
      toast.success(t("promoOk"));
    } catch {
      toast.error(t("promoBad"));
    }
  };

  /**
   * Step 1 — hand the buyer's details to the order that is ALREADY holding
   * these seats, then ask for a payment intent.
   *
   * The reservation happened on the event page, before this form was shown,
   * so there is nothing here that can fail for want of stock.
   */
  const reserve = async (e) => {
    e.preventDefault();
    if (busy) return;
    const next = {};
    if (name.trim().length < 3) next.name = t("errName");
    if (!emailOk(email)) next.email = t("errEmail");
    if (!phoneOk(phone)) next.phone = t("errPhone");
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const pay = await api.post(`/orders/${cart.orderId}/pay`, {
        holderName: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
      setPayment(pay);

      // Mock mode settles immediately — there is no gateway to redirect to.
      if (pay.mode === "mock" && pay.settled) {
        clear();
        navigate(`/confirmation/${cart.orderId}`);
      }
    } catch (err) {
      setPayment(null);
      // 410 = the hold lapsed while they were filling the form. Send them
      // back to pick again rather than leaving them on a dead page.
      if (err.status === 410) {
        clear();
        toast.error(t("holdExpired"));
        navigate(`/evenements/${cart.eventSlug}`);
        return;
      }
      toast.error(err.message || t("reserveFail"));
    } finally {
      setBusy(false);
    }
  };

  const holdLeft = holdUntil && now ? Math.max(0, Date.parse(holdUntil) - now) : null;
  const stripeReady = payment?.mode === "stripe" && payment.clientSecret && payment.publishableKey;

  return (
    <Shell>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:px-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <h1 className="font-display text-3xl font-extrabold">{t("payTitle")}</h1>
          <ol className="mt-4 flex gap-2 text-xs font-bold">
            <li className={`rounded-full px-3 py-1 ${payment ? "bg-paper text-muted" : "bg-lagon text-foam"}`}>1 · {t("stepInfo")}</li>
            <li className={`rounded-full px-3 py-1 ${payment ? "bg-lagon text-foam" : "bg-paper text-muted"}`}>2 · {t("stepPay")}</li>
            <li className="rounded-full bg-paper px-3 py-1 text-muted">3 · {t("stepDone")}</li>
          </ol>

          {payment?.mode === "mock" ? (
            <p className="mt-4 rounded-xl bg-brume px-4 py-3 text-sm text-lagon-deep">{t("mockMode")}</p>
          ) : null}

          {holdLeft !== null ? (
            <p className="mt-3 rounded-xl bg-safran px-4 py-3 text-sm font-semibold text-encre">
              {tf("holdLeft", {
                m: String(Math.floor(holdLeft / 60000)).padStart(2, "0"),
                s: String(Math.floor((holdLeft % 60000) / 1000)).padStart(2, "0"),
              })}
            </p>
          ) : (
            <p className="mt-4 rounded-xl bg-brume px-4 py-3 text-sm text-lagon-deep">{t("holdNote")}</p>
          )}

          {!payment ? (
            <form className="mt-4 space-y-4" onSubmit={reserve}>
              <section className="rounded-xl border border-line/10 bg-card p-4 shadow-card md:p-6">
                <h2 className="font-display text-xl font-bold">{t("buyer")}</h2>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="block text-sm">
                    {t("fullName")}
                    <input className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                    {errors.name ? <span className="text-corail">{errors.name}</span> : null}
                  </label>
                  <label className="block text-sm">
                    {t("email")}
                    <input className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                    {errors.email ? <span className="text-corail">{errors.email}</span> : null}
                  </label>
                  <label className="block text-sm md:col-span-2">
                    {t("phone")}
                    <input className="field mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="06 12 34 56 78" />
                    {errors.phone ? <span className="text-corail">{errors.phone}</span> : null}
                  </label>
                </div>
                <button type="submit" disabled={busy} className="mt-5 h-14 w-full rounded-full bg-safran text-sm font-semibold text-encre disabled:opacity-60">
                  {busy ? t("reserving") : t("stepPay")}
                </button>
                <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-muted">
                  <Lock className="size-3 shrink-0" />
                  {t("cardSecure")}
                </p>
              </section>
            </form>
          ) : (
            <section className="mt-4 rounded-xl border border-line/10 bg-card p-4 shadow-card md:p-6">
              <h2 className="font-display text-xl font-bold">{t("payMethod")}</h2>
              <div className="mt-4">
                {stripeReady ? (
                  <StripeForm
                    publishableKey={payment.publishableKey}
                    clientSecret={payment.clientSecret}
                    dueCents={due}
                    returnUrl={`${window.location.origin}/confirmation/${cart.orderId}`}
                    onError={onPayError}
                  />
                ) : (
                  <p className="text-sm text-muted">{t("processing")}</p>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="h-fit rounded-xl bg-encre p-4 text-foam">
          <img src={event.image} alt="" className="h-32 w-full rounded-lg object-cover" />
          <h2 className="mt-3 font-display text-xl font-bold">{locale === "ar" ? event.titleAr : event.titleFr}</h2>
          <p className="text-sm text-mist">{event.city}</p>
          <div className="mt-4 space-y-2 text-sm">
            {lines.map((line) => (
              <p key={line.tier.id} className="flex justify-between gap-2">
                <span>
                  {line.qty} × {locale === "ar" ? line.tier.nameAr : line.tier.nameFr}
                </span>
                <span className="tabular-nums">{money(line.qty * line.tier.priceCents)} MAD</span>
              </p>
            ))}
          </div>
          {!payment ? (
            <form className="mt-4 flex gap-2" onSubmit={applyPromo}>
              <input className="field h-11 flex-1 font-mono" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder={t("promo")} />
              <button className="h-11 rounded-full bg-safran px-4 text-sm font-semibold text-encre" type="submit">
                {t("promoApply")}
              </button>
            </form>
          ) : null}
          {discountCents > 0 ? <p className="mt-2 text-sm text-safran">{t("discount")} −{money(discountCents)} MAD</p> : null}
          <p className="mt-4 border-t border-foam/15 pt-3">
            <span className="block text-sm text-mist">{t("total")}</span>
            <span className="font-display text-3xl font-extrabold tabular-nums">{money(due)} MAD</span>
          </p>
        </aside>
      </div>
    </Shell>
  );
}
