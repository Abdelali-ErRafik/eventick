import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { api, money } from "../api";

export default function Confirmation() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get(`/orders/${orderId}`)
      .then((data) => setOrder(data.order))
      .catch((err) => setError(err.message));
  }, [orderId]);

  if (error) return <Shell><p className="p-8 text-corail">{error}</p></Shell>;
  if (!order) return <Shell><p className="p-8 text-muted">...</p></Shell>;

  return (
    <Shell>
      <div className="mx-auto max-w-xl px-4 py-10 text-center">
        <h1 className="text-3xl">Paiement confirmé</h1>
        <p className="mt-2 font-mono text-sm text-muted">{order.id} · {order.paymentRef}</p>
        <p className="mt-4 font-display text-2xl font-extrabold">{money(order.totalCents)} MAD</p>

        <div className="mt-6 grid gap-3 text-start">
          {order.tickets.map((ticket) => (
            <Link key={ticket.id} to={`/billet/${ticket.id}`} className="rounded-xl border border-line/15 p-4 font-mono text-sm">
              {ticket.ref}
            </Link>
          ))}
        </div>

        <Link to="/billets" className="mt-6 inline-flex h-12 items-center rounded-full bg-lagon px-6 font-semibold text-foam">
          Voir mes billets
        </Link>
      </div>
    </Shell>
  );
}
