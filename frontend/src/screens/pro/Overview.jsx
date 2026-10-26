import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { longDate, todayKey } from "../../utils";
import { text } from "./copy";

export default function Overview() {
  const { locale } = useI18n();
  const t = text[locale];
  const [events, setEvents] = useState(null);
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api.get("/organiser/events").then((data) => setEvents(data.events));
    api.get("/organiser/orders/detailed").then((data) => setOrders(data.orders));
  }, []);

  const today = todayKey();
  const upcoming = (events ?? []).filter((event) => event.end >= today).slice(0, 4);
  const recent = (orders ?? []).slice(0, 4);
  const allTickets = (orders ?? []).flatMap((order) => order.tickets).filter((ticket) => ticket.status !== "CANCELLED");
  const inside = allTickets.filter((ticket) => ticket.status === "USED").length;
  const gmv = (orders ?? [])
    .filter((order) => order.status === "PAID")
    .reduce((sum, order) => sum + order.totalCents, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-extrabold">{t.overview}</h1>
          <p className="mt-2 max-w-2xl text-muted">{t.lead}</p>
        </div>
        <Link to="/organiser" className="inline-flex h-11 items-center rounded-full bg-safran px-4 text-sm font-semibold text-encre">
          {t.create}
        </Link>
      </div>
      <ol className="mt-6 grid gap-2 sm:grid-cols-4">
        {t.loop.map((step, index) => (
          <li key={step} className="rounded-xl bg-card px-3 py-3 text-sm shadow-card">
            <span className="font-mono text-xs font-bold text-lagon">0{index + 1}</span>
            <p className="font-semibold">{step}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label={t.gmv} value={`${money(gmv)} MAD`} />
        <Stat label={t.tickets} value={String(allTickets.length)} />
        <Stat label={t.inside} value={`${inside}/${allTickets.length}`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-line/10 bg-card p-4 shadow-card">
          <h2 className="font-display text-xl font-extrabold">{t.upcoming}</h2>
          <ul className="mt-3 grid gap-3">
            {upcoming.map((event) => (
              <li key={event.slug} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{locale === "ar" ? event.titleAr : event.titleFr}</p>
                  <p className="text-sm text-muted">
                    {event.city} · {longDate(event.start, locale)}
                  </p>
                </div>
                <Link to={`/evenements/${event.slug}`} className="text-sm font-semibold text-lagon">
                  {t.public}
                </Link>
              </li>
            ))}
            {events && upcoming.length === 0 ? <li className="text-sm text-muted">{t.empty}</li> : null}
          </ul>
        </section>
        <section className="rounded-xl border border-line/10 bg-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-extrabold">{t.recent}</h2>
            <Link to="/pro/orders" className="text-sm font-semibold text-lagon">
              {t.open}
            </Link>
          </div>
          <ul className="mt-3 grid gap-3">
            {recent.map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{order.holderName}</p>
                  <p className="text-sm text-muted">{order.tickets[0] ? (locale === "ar" ? order.tickets[0].event.titleAr : order.tickets[0].event.titleFr) : order.id}</p>
                </div>
                <span className="text-sm font-semibold">{money(order.totalCents)} MAD</span>
              </li>
            ))}
            {orders && recent.length === 0 ? <li className="text-sm text-muted">{t.empty}</li> : null}
          </ul>
        </section>
      </div>
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
