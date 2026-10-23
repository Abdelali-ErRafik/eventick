import { useEffect, useState } from "react";
import { api, money } from "../../api";

export default function Overview() {
  const [events, setEvents] = useState(null);
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api.get("/organiser/events").then((data) => setEvents(data.events));
    api.get("/organiser/orders").then((data) => setOrders(data.orders));
  }, []);

  const gmv = orders?.reduce((sum, order) => (order.status === "PAID" ? sum + order.totalCents : sum), 0) ?? 0;
  const ticketsIssued = orders?.reduce((sum, order) => sum + order.ticketCount, 0) ?? 0;

  return (
    <div>
      <h1 className="text-3xl">Vue d'ensemble</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Revenu" value={`${money(gmv)} MAD`} />
        <Stat label="Billets émis" value={ticketsIssued} />
        <Stat label="Événements" value={events?.length ?? "..."} />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-line/15 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-display text-2xl font-extrabold">{value}</p>
    </div>
  );
}
