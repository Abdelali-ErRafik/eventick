import { useEffect, useState } from "react";
import { Shell } from "../components/Shell";
import { Protected } from "../components/Protected";
import { api, money } from "../api";

function MyTicketsInner() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api.get("/orders").then((data) => setOrders(data.orders));
  }, []);

  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl">Mes billets</h1>
        {!orders ? <p className="mt-4 text-muted">...</p> : null}
        <div className="mt-6 grid gap-3">
          {orders?.map((order) => (
            <div key={order.id} className="rounded-xl border border-line/15 p-4">
              <p className="font-mono text-xs text-muted">{order.id}</p>
              <p className="font-semibold">{money(order.totalCents)} MAD · {order.tickets.length} billet(s)</p>
            </div>
          ))}
          {orders && orders.length === 0 ? <p className="text-muted">Aucun billet pour le moment.</p> : null}
        </div>
      </div>
    </Shell>
  );
}

export default function MyTickets() {
  return (
    <Protected>
      <MyTicketsInner />
    </Protected>
  );
}
