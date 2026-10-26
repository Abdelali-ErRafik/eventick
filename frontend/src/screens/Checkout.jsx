import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "../components/Shell";
import { api, money } from "../api";
import { useCart } from "../CartContext";
import { useAuth } from "../AuthContext";
import { useI18n } from "../i18n";
import { digitsOnly, emailOk, expOk, formatCard, formatExp, luhnOk, phoneOk, DEMO_3DS } from "../payment";

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
  const [pan, setPan] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [errors, setErrors] = useState({});
  const [now, setNow] = useState(0);
  const [promo, setPromo] = useState("");
  const [promoOn, setPromoOn] = useState("");
  const [discountCents, setDiscountCents] = useState(0);
  const [phase, setPhase] = useState("form");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const lock = useRef(false);

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

  useEffect(() => {
    if (!cart?.holdUntil || !now) return;
    if (Date.parse(cart.holdUntil) > now) return;
    clear();
    toast.error(t("holdExpired"));
    navigate("/explorer");
  }, [cart, now, clear, navigate, t]);

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

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (name.trim().length < 3) next.name = t("errName");
    if (!emailOk(email)) next.email = t("errEmail");
    if (!phoneOk(phone)) next.phone = t("errPhone");
    if (!luhnOk(pan)) next.pan = t("errCard");
    if (!expOk(exp)) next.exp = t("errExp");
    if (!/^\d{3}$/.test(cvc)) next.cvc = t("errCvc");
    setErrors(next);
    if (Object.keys(next).length) return;
    setPhase("tds");
    setOtp("");
    setOtpError("");
  };

  const confirm = async () => {
    if (lock.current) return;
    if (otp.trim() !== DEMO_3DS) {
      setOtpError(t("wrongCode"));
      return;
    }
    lock.current = true;
    setPhase("bank");
    try {
      const { order } = await api.post("/orders/checkout", {
        eventSlug: event.slug,
        lines: lines.map((line) => ({ tierId: line.tier.id, qty: line.qty })),
        holderName: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        pan,
        exp,
        otp,
        promoCode: promoOn || undefined,
      });
      clear();
      navigate(`/confirmation/${order.id}`);
    } catch (err) {
      lock.current = false;
      setPhase("form");
      toast.error(err.status === 409 ? t("oversell") : err.message);
    }
  };

  const holdLeft = cart.holdUntil && now ? Math.max(0, Date.parse(cart.holdUntil) - now) : null;

  return (
    <Shell>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:px-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <h1 className="font-display text-3xl font-extrabold">{t("payTitle")}</h1>
          <ol className="mt-4 flex gap-2 text-xs font-bold">
            <li className="rounded-full bg-lagon px-3 py-1 text-foam">1 · {t("stepInfo")}</li>
            <li className="rounded-full bg-lagon px-3 py-1 text-foam">2 · {t("stepPay")}</li>
            <li className="rounded-full bg-paper px-3 py-1 text-muted">3 · {t("stepDone")}</li>
          </ol>
          <p className="mt-4 rounded-xl bg-brume px-4 py-3 text-sm text-lagon-deep">{t("demoBanner")}</p>
          {holdLeft !== null ? (
            <p className="mt-3 rounded-xl bg-safran px-4 py-3 text-sm font-semibold text-encre">
              {tf("holdLeft", {
                m: String(Math.floor(holdLeft / 60000)).padStart(2, "0"),
                s: String(Math.floor((holdLeft % 60000) / 1000)).padStart(2, "0"),
              })}
            </p>
          ) : null}
          <form className="mt-4 space-y-4" onSubmit={submit}>
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
            </section>
            <section className="rounded-xl border border-line/10 bg-card p-4 shadow-card md:p-6">
              <h2 className="font-display text-xl font-bold">{t("payMethod")}</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block text-sm md:col-span-2">
                  {t("cardNumber")}
                  <input
                    className="field mt-1 font-mono"
                    inputMode="numeric"
                    value={formatCard(pan)}
                    onChange={(e) => setPan(digitsOnly(e.target.value).slice(0, 16))}
                    autoComplete="cc-number"
                    placeholder="4242 4242 4242 4242"
                  />
                  {errors.pan ? <span className="text-corail">{errors.pan}</span> : null}
                </label>
                <label className="block text-sm">
                  {t("expiry")}
                  <input
                    className="field mt-1 font-mono"
                    inputMode="numeric"
                    placeholder="MM / AA"
                    value={formatExp(exp)}
                    onChange={(e) => setExp(digitsOnly(e.target.value).slice(0, 4))}
                    autoComplete="cc-exp"
                  />
                  {errors.exp ? <span className="text-corail">{errors.exp}</span> : null}
                </label>
                <label className="block text-sm">
                  {t("cvc")}
                  <input
                    className="field mt-1 font-mono"
                    inputMode="numeric"
                    maxLength={3}
                    value={cvc}
                    onChange={(e) => setCvc(digitsOnly(e.target.value).slice(0, 3))}
                    autoComplete="cc-csc"
                  />
                  {errors.cvc ? <span className="text-corail">{errors.cvc}</span> : null}
                </label>
              </div>
              <button type="submit" className="mt-5 h-14 w-full rounded-full bg-safran text-sm font-semibold text-encre disabled:opacity-60" disabled={phase !== "form"}>
                {phase === "bank" ? t("processing") : tf("payNow", { total: `${money(due)} MAD` })}
              </button>
              <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted">
                <Lock className="size-3" />
                {t("secureNote")}
              </p>
            </section>
          </form>
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
          <form className="mt-4 flex gap-2" onSubmit={applyPromo}>
            <input className="field h-11 flex-1 font-mono" value={promo} onChange={(e) => setPromo(e.target.value)} placeholder={t("promo")} />
            <button className="h-11 rounded-full bg-safran px-4 text-sm font-semibold text-encre" type="submit">
              {t("promoApply")}
            </button>
          </form>
          {discountCents > 0 ? <p className="mt-2 text-sm text-safran">{t("discount")} −{money(discountCents)} MAD</p> : null}
          <p className="mt-4 border-t border-foam/15 pt-3">
            <span className="block text-sm text-mist">{t("total")}</span>
            <span className="font-display text-3xl font-extrabold tabular-nums">{money(due)} MAD</span>
          </p>
        </aside>
      </div>

      {phase !== "form" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-encre/60 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-card p-5 text-ink shadow-modal">
            <p className="font-mono text-xs font-bold text-lagon">CMI · 3-D SECURE</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold">{t("tdsTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{phase === "bank" ? t("processingBank") : t("tdsBody")}</p>
            <p className="mt-3 rounded-xl bg-brume px-3 py-2 text-sm">
              {t("tdsCode")} · <span className="font-mono font-bold">{DEMO_3DS}</span>
            </p>
            <label className="mt-3 block text-sm">
              {t("tdsPh")}
              <input className="field mt-1 font-mono tracking-widest" inputMode="numeric" value={otp} onChange={(e) => setOtp(digitsOnly(e.target.value).slice(0, 6))} />
            </label>
            {otpError ? <p className="mt-2 text-sm text-corail">{otpError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button type="button" className="h-12 flex-1 rounded-full border border-line/15" onClick={() => setPhase("form")} disabled={phase === "bank"}>
                {t("cancel")}
              </button>
              <button type="button" className="h-12 flex-1 rounded-full bg-lagon font-semibold text-foam disabled:opacity-60" onClick={confirm} disabled={phase === "bank"}>
                {phase === "bank" ? t("processing") : t("confirmBank")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
