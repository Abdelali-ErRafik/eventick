import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { api, money } from "../api";
import { useCart } from "../CartContext";
import { useI18n } from "../i18n";

const MAX_QTY_PER_TIER = 8;

export default function EventDetail() {
  const { slug } = useParams();
  const { t, locale } = useI18n();
  const { setCart } = useCart();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [error, setError] = useState(null);
  const [qty, setQty] = useState({});

  useEffect(() => {
    api
      .get(`/events/${slug}`)
      .then((data) => setEvent(data.event))
      .catch((err) => setError(err.message));
  }, [slug]);

  if (error) return <Shell><p className="p-8 text-corail">{error}</p></Shell>;
  if (!event) return <Shell><p className="p-8 text-muted">...</p></Shell>;

  const title = locale === "ar" ? event.titleAr : event.titleFr;
  const venue = locale === "ar" ? event.venueAr : event.venueFr;

  const setTierQty = (tierId, left, delta) => {
    setQty((prev) => ({
      ...prev,
      [tierId]: Math.max(0, Math.min(left, MAX_QTY_PER_TIER, (prev[tierId] ?? 0) + delta)),
    }));
  };

  const lines = Object.entries(qty).filter(([, n]) => n > 0).map(([tierId, qtyValue]) => ({ tierId, qty: qtyValue }));
  const subtotalCents = lines.reduce((sum, line) => {
    const tier = event.tiers.find((item) => item.id === line.tierId);
    return sum + (tier ? tier.priceCents * line.qty : 0);
  }, 0);

  const handleCheckout = () => {
    if (!lines.length) return;
    setCart({ eventSlug: event.slug, lines });
    navigate("/paiement");
  };

  return (
    <Shell>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <img src={event.image} alt="" className="h-72 w-full rounded-xl object-cover" />
        <h1 className="mt-6 font-display text-4xl font-extrabold">{title}</h1>
        <p className="mt-1 text-muted">{venue}, {event.city}</p>
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{locale === "ar" ? event.aboutAr : event.aboutFr}</p>

        <div className="mt-8 flex flex-col gap-3">
          {event.tiers.map((tier) => (
            <div key={tier.id} className="flex items-center justify-between gap-4 rounded-xl border border-line/15 p-4">
              <div>
                <p className="font-semibold">{locale === "ar" ? tier.nameAr : tier.nameFr}</p>
                <p className="text-sm text-muted">{money(tier.priceCents)} MAD · {tier.remaining} {t("left")}</p>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setTierQty(tier.id, tier.remaining, -1)} className="size-8 rounded-full border">-</button>
                <span className="w-6 text-center">{qty[tier.id] ?? 0}</span>
                <button type="button" onClick={() => setTierQty(tier.id, tier.remaining, 1)} className="size-8 rounded-full border">+</button>
              </div>
            </div>
          ))}
        </div>

        {lines.length > 0 ? (
          <div className="sticky bottom-4 mt-6 flex items-center justify-between rounded-xl border border-line/15 bg-card p-4 shadow-pop">
            <p className="font-display text-2xl font-extrabold">{money(subtotalCents)} MAD</p>
            <button type="button" onClick={handleCheckout} className="h-12 rounded-full bg-safran px-6 font-semibold text-encre">
              {t("buy")}
            </button>
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
