import { useEffect, useState } from "react";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { planCost } from "../../strategy";
import { text } from "./copy";

const PLANS = [
  { id: "starter", label: "Starter · 5%" },
  { id: "pro", label: "Pro · 499 + 3%" },
  { id: "business", label: "Business · 1 999 + 2%" },
];

export default function Finance() {
  const { locale } = useI18n();
  const t = text[locale];
  const [orders, setOrders] = useState(null);
  const [plan, setPlan] = useState("starter");

  useEffect(() => {
    api.get("/organiser/orders/detailed").then((data) => setOrders(data.orders));
  }, []);

  const gmv = (orders ?? []).filter((order) => order.status === "PAID").reduce((sum, order) => sum + order.totalCents, 0);
  const fee = planCost(plan, gmv);

  const byEvent = new Map();
  for (const order of orders ?? []) {
    for (const ticket of order.tickets) {
      if (ticket.status === "CANCELLED") continue;
      const title = locale === "ar" ? ticket.event.titleAr : ticket.event.titleFr;
      const current = byEvent.get(ticket.event.slug) ?? { title, gross: 0 };
      current.gross += ticket.priceCents;
      byEvent.set(ticket.event.slug, current);
    }
  }

  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold">{t.finance}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t.payout}</p>
      <p className="mt-2 font-mono text-sm text-lagon">{t.account}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label={t.gross} value={`${money(gmv)} MAD`} />
        <Stat label={t.fee} value={`${money(fee)} MAD`} />
        <Stat label={t.net} value={`${money(gmv - fee)} MAD`} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {PLANS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPlan(item.id)}
            className={`h-11 rounded-full px-4 text-sm font-semibold ${plan === item.id ? "bg-encre text-foam" : "bg-card"}`}
          >
            {t.plan} {item.label}
          </button>
        ))}
      </div>
      <h2 className="mt-8 font-display text-2xl font-extrabold">{t.perEvent}</h2>
      <ul className="mt-3 grid gap-2">
        {[...byEvent.values()].map((row) => (
          <li key={row.title} className="flex items-center justify-between rounded-xl bg-card px-4 py-3 shadow-card">
            <span className="font-semibold">{row.title}</span>
            <span>{money(row.gross)} MAD</span>
          </li>
        ))}
        {orders && byEvent.size === 0 ? <li className="text-sm text-muted">{t.empty}</li> : null}
      </ul>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-line/10 bg-card p-4 shadow-card">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
    </div>
  );
}
