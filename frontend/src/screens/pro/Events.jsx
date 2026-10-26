import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { CITIES, longDate, totalCapacity, totalRemaining } from "../../utils";
import { text } from "./copy";

export default function Events() {
  const { locale } = useI18n();
  const t = text[locale];
  const navigate = useNavigate();
  const [events, setEvents] = useState(null);
  const [orders, setOrders] = useState(null);
  const [edit, setEdit] = useState("");
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("Casablanca");

  const load = () => {
    api.get("/organiser/events").then((data) => setEvents(data.events));
    api.get("/organiser/orders/detailed").then((data) => setOrders(data.orders));
  };

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    if (!events || !orders) return [];
    return events
      .map((event) => {
        const tickets = orders.flatMap((order) => order.tickets).filter((ticket) => ticket.event.slug === event.slug && ticket.status !== "CANCELLED");
        return {
          event,
          issued: tickets.length,
          revenue: tickets.reduce((sum, ticket) => sum + ticket.priceCents, 0),
          left: totalRemaining(event),
          cap: totalCapacity(event),
          hidden: event.status === "HIDDEN",
        };
      })
      .sort((a, b) => b.issued - a.issued || a.event.start.localeCompare(b.event.start));
  }, [events, orders]);

  const openEdit = (slug) => {
    const event = events.find((item) => item.slug === slug);
    if (!event) return;
    setEdit(slug);
    setTitle(locale === "ar" ? event.titleAr : event.titleFr);
    setCity(event.city);
  };

  const toggleHidden = async (slug, hidden) => {
    await api.patch(`/organiser/events/${slug}/visibility`, { hidden });
    load();
    toast.success(t.saved);
  };

  const removeEvent = async (slug) => {
    await api.del(`/organiser/events/${slug}`);
    load();
    toast.success(t.removed);
  };

  const duplicate = (event) => {
    // No separate "duplicate" endpoint — reuse the organiser form pre-filled
    // from this event, same effect as the old client-side copy-with-new-slug.
    sessionStorage.setItem(
      "eventick-duplicate",
      JSON.stringify({
        titleFr: `${event.titleFr} · copie`,
        titleAr: `${event.titleAr} · نسخة`,
        city: event.city,
        venue: event.venueFr,
        about: event.aboutFr,
        price: (event.tiers[0]?.priceCents ?? 0) / 100,
        stock: event.tiers[0]?.capacity ?? 0,
        cover: event.image,
      }),
    );
    navigate("/organiser");
  };

  const exportGuests = (event) => {
    const lines = [["ref", "holder", "status", "tier", "price"]];
    for (const order of orders) {
      for (const ticket of order.tickets) {
        if (ticket.event.slug !== event.slug) continue;
        lines.push([ticket.ref, ticket.holderName, ticket.status, locale === "ar" ? ticket.tierNameAr : ticket.tierNameFr, String(ticket.priceCents / 100)]);
      }
    }
    const csv = lines.map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${event.slug}-participants.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl font-extrabold">{t.events}</h1>
        <Link to="/organiser" className="inline-flex h-11 items-center rounded-full bg-safran px-4 text-sm font-semibold text-encre">
          {t.create}
        </Link>
      </div>
      {edit ? (
        <form
          className="mt-4 grid gap-2 rounded-xl bg-card p-4 shadow-card md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await api.patch(`/organiser/events/${edit}`, { titleFr: title, titleAr: title, city });
            setEdit("");
            load();
            toast.success(t.saved);
          }}
        >
          <input className="field h-11 md:col-span-2" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <select className="field h-11" value={city} onChange={(e) => setCity(e.target.value)}>
            {CITIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <div className="flex gap-2 md:col-span-2">
            <button className="h-11 rounded-full bg-lagon px-4 text-sm font-semibold text-foam" type="submit">
              {t.save}
            </button>
            <button className="h-11 rounded-full bg-paper px-4 text-sm font-semibold" type="button" onClick={() => setEdit("")}>
              {t.close}
            </button>
          </div>
        </form>
      ) : null}
      <div className="mt-6 grid gap-3">
        {rows.map((row) => (
          <article key={row.event.slug} className="flex flex-wrap items-center gap-3 rounded-xl border border-line/10 bg-card p-3 shadow-card">
            <img src={row.event.image} alt="" className="size-16 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-extrabold">{locale === "ar" ? row.event.titleAr : row.event.titleFr}</h2>
              <p className="text-sm text-muted">
                {row.event.city} · {longDate(row.event.start, locale)}
                {row.hidden ? ` · ${t.hidden}` : ""}
              </p>
              <p className="text-sm">
                {row.issued} {t.issued} · {row.left} {t.left} / {row.cap} {t.cap} · {money(row.revenue)} MAD
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm font-semibold">
              <button type="button" className="h-11 rounded-full bg-paper px-3" onClick={() => openEdit(row.event.slug)}>
                {t.edit}
              </button>
              <button type="button" className="h-11 rounded-full bg-paper px-3" onClick={() => duplicate(row.event)}>
                {t.duplicate}
              </button>
              <button type="button" className="h-11 rounded-full bg-paper px-3" onClick={() => exportGuests(row.event)}>
                {t.guests}
              </button>
              <button type="button" className="h-11 rounded-full bg-corail px-3 text-foam" onClick={() => removeEvent(row.event.slug)}>
                {t.remove}
              </button>
              <button type="button" className="h-11 rounded-full bg-encre px-3 text-foam" onClick={() => toggleHidden(row.event.slug, !row.hidden)}>
                {row.hidden ? t.restore : t.hide}
              </button>
              {!row.hidden ? (
                <Link to={`/evenements/${row.event.slug}`} className="inline-flex h-11 items-center text-lagon">
                  {t.public}
                </Link>
              ) : null}
            </div>
          </article>
        ))}
        {events && rows.length === 0 ? <p className="text-muted">{t.empty}</p> : null}
      </div>
    </div>
  );
}
