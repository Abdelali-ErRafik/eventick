import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { tierLeft } from "@/lib/catalog";
import { money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import {
  DEMO_3DS,
  bankFromNumber,
  cardBrand,
  digitsOnly,
  emailOk,
  expOk,
  formatCard,
  formatExp,
  luhnOk,
  phoneOk,
} from "@/lib/payment";
import { explorerSearch } from "@/lib/search";
import { useStore, quotePromo } from "@/lib/store";
import { useCatalog } from "@/lib/use-catalog";

export const Route = createFileRoute("/paiement")({
  component: PayPage,
});

function PayPage() {
  const { locale, t, tf } = useI18n();
  const navigate = useNavigate();
  const cart = useStore((state) => state.cart);
  const profile = useStore((state) => state.profile);
  const cards = useStore((state) => state.cards);
  const hydrated = useStore((state) => state.hydrated);
  const placeOrder = useStore((state) => state.placeOrder);
  const setCart = useStore((state) => state.setCart);
  const promos = useStore((state) => state.promos) ?? [];
  const addCard = useStore((state) => state.addCard);
  const { bySlug, sold } = useCatalog();
  const event = cart ? bySlug(cart.slug) : undefined;
  const filled = useRef(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("new");
  const [pan, setPan] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [holder, setHolder] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [now, setNow] = useState(0);
  const [promo, setPromo] = useState("");
  const [promoOn, setPromoOn] = useState("");
  const [phase, setPhase] = useState<"form" | "tds" | "bank">("form");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");

  useEffect(() => {
    if (!hydrated || filled.current) return;
    filled.current = true;
    setName(profile.name);
    setEmail(profile.email);
    setPhone(profile.phone);
    setHolder(profile.name.toUpperCase());
    const preferred = cards.find((card) => card.isDefault);
    if (preferred) setSource(preferred.id);
  }, [hydrated, profile, cards]);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!cart?.holdUntil || !now) return;
    if (Date.parse(cart.holdUntil) > now) return;
    setCart(null);
    toast.error(t("holdExpired"));
  }, [cart, now, setCart, t]);

  const lines =
    event && cart
      ? cart.lines
          .map((line) => {
            const tier = event.tiers.find((item) => item.id === line.tierId);
            if (!tier) return null;
            const left = tierLeft(event, tier, sold);
            const qty = Math.min(line.qty, left);
            return qty > 0 ? { tier, qty } : null;
          })
          .filter((line): line is NonNullable<typeof line> => Boolean(line))
      : [];
  const total = lines.reduce((sum, line) => sum + line.qty * line.tier.price, 0);
  const quoted = promoOn && event ? quotePromo(promos, promoOn, event.slug, total) : null;
  const discount = quoted?.discount ?? 0;
  const due = total - discount;

  const saved = cards.find((card) => card.id === source);

  const submit = () => {
    const next: Record<string, string> = {};
    if (name.trim().length < 3) next.name = t("errName");
    if (!emailOk(email)) next.email = t("errEmail");
    if (!phoneOk(phone)) next.phone = t("errPhone");
    if (!saved) {
      if (!luhnOk(pan)) next.pan = t("errCard");
      if (!expOk(exp)) next.exp = t("errExp");
      if (holder.trim().length < 3) next.holder = t("errHolder");
    }
    if (!/^\d{3}$/.test(cvc)) next.cvc = t("errCvc");
    setErrors(next);
    if (Object.keys(next).length) return;
    setPhase("tds");
    setOtp("");
    setOtpError("");
  };

  const lock = useRef(false);

  const confirm = () => {
    if (lock.current || !event) return;
    if (otp.trim() !== DEMO_3DS) {
      setOtpError(t("wrongCode"));
      return;
    }
    lock.current = true;
    setPhase("bank");
    const brand = saved ? saved.brand : cardBrand(pan);
    const last4 = saved ? saved.last4 : digitsOnly(pan).slice(-4);
    const bank = saved ? saved.bank : bankFromNumber(pan);
    window.setTimeout(() => {
      if (!saved && remember) {
        addCard({
          brand: brand === "mastercard" ? "mastercard" : "visa",
          bank,
          last4,
          holder: holder.trim().toUpperCase(),
          exp: formatExp(exp),
          isDefault: false,
        });
      }
      const order = placeOrder({
        event,
        lines: lines.map((line) => ({ tierId: line.tier.id, qty: line.qty })),
        holder: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        brand,
        last4,
        bank,
        promoCode: promoOn || undefined,
      });
      if (!order) {
        lock.current = false;
        setPhase("form");
        toast.error(t("oversell"));
        return;
      }
      void navigate({ to: "/confirmation/$orderId", params: { orderId: order.id } });
    }, 800);
  };

  if (!hydrated) {
    return (
      <Shell>
        <div className="mx-auto h-80 max-w-3xl animate-pulse px-4 py-10" />
      </Shell>
    );
  }

  if (!event || lines.length === 0) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-extrabold">{t("emptyPay")}</h1>
          <Link to="/explorer" search={explorerSearch()} className="mt-6 inline-flex h-12 items-center rounded-full bg-lagon px-5 font-semibold text-foam">
            {t("backEvents")}
          </Link>
        </div>
      </Shell>
    );
  }

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
          {cart?.holdUntil && now ? (
            <p className="mt-3 rounded-xl bg-safran px-4 py-3 text-sm font-semibold text-encre">
              {tf("holdLeft", {
                m: String(Math.max(0, Math.floor((Date.parse(cart.holdUntil) - now) / 60000))).padStart(2, "0"),
                s: String(Math.max(0, Math.floor(((Date.parse(cart.holdUntil) - now) % 60000) / 1000))).padStart(2, "0"),
              })}
            </p>
          ) : null}
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <section className="rounded-xl border border-line/10 bg-card p-4 shadow-card md:p-6">
              <h2 className="font-display text-xl font-bold">{t("buyer")}</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block text-sm">
                  {t("fullName")}
                  <input className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
                  {errors.name ? <span className="text-corail">{errors.name}</span> : null}
                </label>
                <label className="block text-sm">
                  {t("email")}
                  <input className="field mt-1" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
                  {errors.email ? <span className="text-corail">{errors.email}</span> : null}
                </label>
                <label className="block text-sm md:col-span-2">
                  {t("phone")}
                  <input className="field mt-1" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
                  {errors.phone ? <span className="text-corail">{errors.phone}</span> : null}
                </label>
              </div>
            </section>
            <section className="rounded-xl border border-line/10 bg-card p-4 shadow-card md:p-6">
              <h2 className="font-display text-xl font-bold">{t("payMethod")}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={`h-11 rounded-full px-4 text-sm font-semibold ${source === "new" ? "bg-lagon text-foam" : "bg-paper"}`} onClick={() => setSource("new")}>
                  {t("newCard")}
                </button>
                {cards.map((card) => (
                  <button
                    type="button"
                    key={card.id}
                    className={`h-11 rounded-full px-4 text-sm font-semibold ${source === card.id ? "bg-lagon text-foam" : "bg-paper"}`}
                    onClick={() => setSource(card.id)}
                  >
                    {card.bank} ···· {card.last4}
                  </button>
                ))}
              </div>
              {saved ? (
                <label className="mt-4 block text-sm">
                  {tf("cvcFor", { last: saved.last4 })}
                  <input className="field mt-1 max-w-40" inputMode="numeric" maxLength={3} value={cvc} onChange={(event) => setCvc(digitsOnly(event.target.value).slice(0, 3))} />
                  {errors.cvc ? <span className="text-corail">{errors.cvc}</span> : null}
                </label>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="block text-sm md:col-span-2">
                    {t("cardNumber")}
                    <input className="field mt-1 font-mono" inputMode="numeric" value={formatCard(pan)} onChange={(event) => setPan(digitsOnly(event.target.value).slice(0, 16))} autoComplete="cc-number" />
                    {errors.pan ? <span className="text-corail">{errors.pan}</span> : null}
                  </label>
                  <label className="block text-sm">
                    {t("expiry")}
                    <input className="field mt-1 font-mono" inputMode="numeric" placeholder="MM / AA" value={formatExp(exp)} onChange={(event) => setExp(digitsOnly(event.target.value).slice(0, 4))} autoComplete="cc-exp" />
                    {errors.exp ? <span className="text-corail">{errors.exp}</span> : null}
                  </label>
                  <label className="block text-sm">
                    {t("cvc")}
                    <input className="field mt-1 font-mono" inputMode="numeric" maxLength={3} value={cvc} onChange={(event) => setCvc(digitsOnly(event.target.value).slice(0, 3))} autoComplete="cc-csc" />
                    {errors.cvc ? <span className="text-corail">{errors.cvc}</span> : null}
                  </label>
                  <label className="block text-sm md:col-span-2">
                    {t("holder")}
                    <input className="field mt-1" value={holder} onChange={(event) => setHolder(event.target.value)} autoComplete="cc-name" />
                    {errors.holder ? <span className="text-corail">{errors.holder}</span> : null}
                  </label>
                  <label className="flex items-center gap-2 text-sm md:col-span-2">
                    <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                    {t("saveCard")}
                  </label>
                </div>
              )}
              <button className="mt-5 h-14 w-full rounded-full bg-safran text-sm font-semibold text-encre disabled:opacity-60" disabled={phase !== "form"}>
                {phase === "bank" ? t("processing") : tf("payNow", { total: money(due, locale) })}
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
          <p className="text-sm text-mist">
            {event.city} · {event.start}
          </p>
          <div className="mt-4 space-y-2 text-sm">
            {lines.map((line) => (
              <p key={line.tier.id} className="flex justify-between gap-2">
                <span>
                  {line.qty} × {locale === "ar" ? line.tier.nameAr : line.tier.nameFr}
                </span>
                <span className="tabular-nums">{money(line.qty * line.tier.price, locale)}</span>
              </p>
            ))}
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              const next = quotePromo(promos, promo, event.slug, total);
              if (!next) {
                setPromoOn("");
                toast.error(t("promoBad"));
                return;
              }
              setPromoOn(promo.trim());
              toast.success(t("promoOk"));
            }}
          >
            <input className="field h-11 flex-1 font-mono" value={promo} onChange={(input) => setPromo(input.target.value)} placeholder={t("promo")} />
            <button className="h-11 rounded-full bg-safran px-4 text-sm font-semibold text-encre" type="submit">
              {t("promoApply")}
            </button>
          </form>
          {discount > 0 ? <p className="mt-2 text-sm text-safran">{t("discount")} −{money(discount, locale)}</p> : null}
          <p className="mt-4 border-t border-foam/15 pt-3">
            <span className="block text-sm text-mist">{t("total")}</span>
            <span className="font-display text-3xl font-extrabold tabular-nums">{money(due, locale)}</span>
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
              <input className="field mt-1 font-mono tracking-widest" inputMode="numeric" value={otp} onChange={(event) => setOtp(digitsOnly(event.target.value).slice(0, 6))} />
            </label>
            {otpError ? <p className="mt-2 text-sm text-corail">{otpError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button className="h-12 flex-1 rounded-full border border-line/15" onClick={() => setPhase("form")} disabled={phase === "bank"}>
                {t("cancel")}
              </button>
              <button className="h-12 flex-1 rounded-full bg-lagon font-semibold text-foam disabled:opacity-60" onClick={confirm} disabled={phase === "bank"}>
                {phase === "bank" ? t("processing") : t("confirmBank")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
