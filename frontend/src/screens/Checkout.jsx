import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { api, money } from "../api";
import { useCart } from "../CartContext";
import { useAuth } from "../AuthContext";
import { useI18n } from "../i18n";

export default function Checkout() {
  const { t } = useI18n();
  const { cart, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [holderName, setHolderName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [pan, setPan] = useState("4242 4242 4242 4242");
  const [exp, setExp] = useState("12/29");
  const [otp, setOtp] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [phase, setPhase] = useState("form");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cart) {
      navigate("/explorer");
      return;
    }
    api.get(`/events/${cart.eventSlug}`).then((data) => setEvent(data.event));
  }, [cart, navigate]);

  if (!cart || !event) return <Shell><p className="p-8 text-muted">...</p></Shell>;

  const subtotalCents = cart.lines.reduce((sum, line) => {
    const tier = event.tiers.find((item) => item.id === line.tierId);
    return sum + (tier ? tier.priceCents * line.qty : 0);
  }, 0);

  const submitForm = (e) => {
    e.preventDefault();
    setError(null);
    setPhase("otp");
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const { order } = await api.post("/orders/checkout", {
        eventSlug: event.slug,
        lines: cart.lines,
        holderName,
        email,
        phone,
        pan,
        exp,
        otp,
        promoCode: promoCode || undefined,
      });
      clear();
      navigate(`/confirmation/${order.id}`);
    } catch (err) {
      setError(err.message);
      setPhase("form");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-3xl">{t("find")}</h1>
        <p className="mt-2 font-display text-2xl font-extrabold">{money(subtotalCents)} MAD</p>

        <div className="mt-2 rounded-lg bg-brume px-4 py-3 text-sm">
          Mode démonstration — carte test 4242 4242 4242 4242, code 3-D Secure : 482913.
        </div>

        {error ? <p className="mt-3 rounded-lg bg-corail/10 px-4 py-3 text-sm text-corail">{error}</p> : null}

        {phase === "form" ? (
          <form onSubmit={submitForm} className="mt-6 grid gap-4">
            <Field label="Nom complet" value={holderName} onChange={setHolderName} />
            <Field label="E-mail" type="email" value={email} onChange={setEmail} />
            <Field label="Téléphone" value={phone} onChange={setPhone} placeholder="06 12 34 56 78" />
            <Field label="Numéro de carte" value={pan} onChange={setPan} />
            <Field label="Expiration (MM/YY)" value={exp} onChange={setExp} />
            <Field label="Code promo" value={promoCode} onChange={setPromoCode} placeholder="SAFRAN15" />
            <button type="submit" className="h-12 rounded-full bg-safran font-semibold text-encre">
              {t("buy")}
            </button>
          </form>
        ) : (
          <div className="mt-6 grid gap-4">
            <Field label="Code 3-D Secure" value={otp} onChange={setOtp} placeholder="482913" />
            <button type="button" disabled={busy} onClick={confirm} className="h-12 rounded-full bg-safran font-semibold text-encre disabled:opacity-50">
              {busy ? "..." : "Confirmer le paiement"}
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-lg border border-line/15 px-4 font-normal"
      />
    </label>
  );
}
