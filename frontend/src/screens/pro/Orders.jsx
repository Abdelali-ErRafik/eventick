import { useEffect, useState } from "react";
import { api, money } from "../../api";

export default function Orders() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api.get("/organiser/orders").then((data) => setOrders(data.orders));
  }, []);

  return (
    <div>
      <h1 className="text-3xl">Commandes</h1>
      <div className="mt-6 grid gap-3">
        {orders?.map((order) => (
          <div key={order.id} className="flex items-center justify-between rounded-xl border border-line/15 p-4">
            <div>
              <p className="font-semibold">{order.holderName}</p>
              <p className="text-sm text-muted">{order.eventTitleFr} · {order.ticketCount} billet(s)</p>
            </div>
            <p className="font-semibold">{money(order.totalCents)} MAD</p>
          </div>
        ))}
        {orders && orders.length === 0 ? <p className="text-muted">Aucune commande pour le moment.</p> : null}
      </div>
    </div>
  );
}
