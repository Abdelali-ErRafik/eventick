import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, money } from "../../api";
import { useI18n } from "../../i18n";
import { longDate } from "../../utils";
import { cn } from "../../utils";
import { text } from "./copy";

export default function Orders() {
  const { locale } = useI18n();
  const t = text[locale];
  const [orders, setOrders] = useState(null);
  const [query, setQuery] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [status, setStatus] = useState("");

  const load = () => api.get("/organiser/orders/detailed").then((data) => setOrders(data.orders));

  useEffect(() => {
    load();
  }, []);

  const events = useMemo(() => {
    const map = new Map();
    for (const order of orders ?? []) {
      for (const ticket of order.tickets) map.set(ticket.event.slug, locale === "ar" ? ticket.event.titleAr : ticket.event.titleFr);
    }
    return [...map.entries()];
  }, [orders, locale]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (orders ?? [])
      .map((order) => ({
        order,
        tickets: order.tickets.filter((ticket) => {
          if (eventSlug && ticket.event.slug !== eventSlug) return false;
          if (status && ticket.status !== status) return false;
          if (!needle) return true;
          return `${order.holderName} ${order.email} ${order.id} ${ticket.ref} ${ticket.event.titleFr} ${ticket.event.titleAr}`.toLowerCase().includes(needle);
        }),
      }))
      .filter((row) => row.tickets.length > 0);
  }, [orders, query, eventSlug, status]);

  const label = (value) => (value === "VALID" ? t.valid : value === "USED" ? t.used : value === "CANCELLED" ? t.cancelled : t.transferred);

  const cancelOrder = async (id) => {
    await api.post(`/organiser/orders/${id}/cancel`, {});
    load();
    toast.success(t.cancelled);
  };

  const removeOrder = async (id) => {
    await api.del(`/organiser/orders/${id}`);
    load();
    toast.success(t.removed);
  };

  const toggleAdmit = async (ticketId, currentStatus) => {
    const next = currentStatus === "USED" ? "VALID" : "USED";
    await api.patch(`/organiser/tickets/${ticketId}/status`, { status: next });
    load();
    toast.success(next === "USED" ? t.admitted : t.undone);
  };

  const exportCsv = () => {
    const lines = [["order", "ref", "event", "holder", "email", "status", "price"]];
    for (const row of visible) {
      for (const ticket of row.tickets) {
        lines.push([row.order.id, ticket.ref, ticket.event.titleFr, row.order.holderName, row.order.email, ticket.status, String(ticket.priceCents / 100)]);
      }
    }
    const csv = lines.map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "eventick-reservations.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold">{t.orders}</h1>
      <div className="mt-6 grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
        <input className="field h-11" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} />
        <select className="field h-11" value={eventSlug} onChange={(e) => setEventSlug(e.target.value)}>
          <option value="">{t.allEvents}</option>
          {events.map(([slug, title]) => (
            <option key={slug} value={slug}>
              {title}
            </option>
          ))}
        </select>
        <select className="field h-11" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t.allStatus}</option>
          <option value="VALID">{t.valid}</option>
          <option value="USED">{t.used}</option>
          <option value="TRANSFERRED">{t.transferred}</option>
          <option value="CANCELLED">{t.cancelled}</option>
        </select>
        <button type="button" className="h-11 rounded-full bg-paper px-4 text-sm font-semibold" onClick={exportCsv}>
          {t.export}
        </button>
      </div>
      <div className="mt-4 grid gap-3">
        {orders && visible.length === 0 ? <p className="rounded-xl bg-card p-6 text-muted">{t.empty}</p> : null}
        {visible.map(({ order, tickets }) => (
          <article key={order.id} className="rounded-xl border border-line/10 bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-bold text-lagon">{order.id}</p>
                <h2 className="font-display text-xl font-extrabold">{order.holderName}</h2>
                <p className="text-sm text-muted">
                  {order.email} · {order.phone}
                </p>
              </div>
              <p className="font-display text-xl font-extrabold">{money(tickets.reduce((sum, ticket) => sum + ticket.priceCents, 0))} MAD</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="h-11 rounded-full bg-paper px-4 text-sm font-semibold" onClick={() => cancelOrder(order.id)}>
                {t.cancelOrder}
              </button>
              <button type="button" className="h-11 rounded-full bg-corail px-4 text-sm font-semibold text-foam" onClick={() => removeOrder(order.id)}>
                {t.remove}
              </button>
            </div>
            <ul className="mt-3 grid gap-2">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper px-3 py-3">
                  <div>
                    <p className="font-semibold">{locale === "ar" ? ticket.event.titleAr : ticket.event.titleFr}</p>
                    <p className="text-sm text-muted">
                      {longDate(ticket.event.start, locale)} · {locale === "ar" ? ticket.tierNameAr : ticket.tierNameFr}
                    </p>
                    <p className="font-mono text-xs">{ticket.ref}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-1 text-xs font-bold", ticket.status === "USED" ? "bg-encre text-foam" : "bg-brume text-lagon")}>{label(ticket.status)}</span>
                    <Link to={`/billet/${ticket.id}`} className="text-sm font-semibold text-lagon">
                      {t.open}
                    </Link>
                    {ticket.status === "VALID" || ticket.status === "USED" ? (
                      <button type="button" className="h-11 rounded-full bg-lagon px-4 text-sm font-semibold text-foam" onClick={() => toggleAdmit(ticket.id, ticket.status)}>
                        {ticket.status === "USED" ? t.undo : t.admit}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
