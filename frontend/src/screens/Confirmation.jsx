import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { TicketPass, toTicketPassProps } from "../components/TicketPass";
import { api, money } from "../api";
import { useI18n } from "../i18n";

export default function Confirmation() {
  const { orderId } = useParams();
  const { t } = useI18n();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get(`/orders/${orderId}`)
      .then((data) => setOrder(data.order))
      .catch((err) => setError(err.message));
  }, [orderId]);

  if (error) {
    return (
      <Shell>
        <div className="mx-auto max-w-3xl px-4 py-10 text-center md:px-8">
          <h1 className="font-display text-3xl font-extrabold">{t("notFound")}</h1>
          <Link to="/billets" className="mt-4 inline-flex h-12 items-center rounded-full bg-primary px-5 font-semibold text-primary-fg transition hover:bg-primary-hover">
            {t("seeTickets")}
          </Link>
        </div>
      </Shell>
    );
  }

  if (!order) {
    return (
      <Shell>
        <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
          <div className="h-64 animate-pulse rounded-card bg-card" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <div className="text-center">
          <span className="mx-auto inline-flex size-16 items-center justify-center rounded-full bg-success text-success-fg">
            <Check className="size-8" />
          </span>
          <h1 className="mt-4 font-display text-4xl font-extrabold">{t("paid")}</h1>
          <p className="mt-2 text-muted">{t("paidBody")}</p>
          <p className="mt-3 font-mono text-sm">
            {t("orderRef")} {order.id} · {t("auth")} {order.paymentRef}
          </p>
          <p className="mt-1 font-display text-3xl font-extrabold tabular-nums">{money(order.totalCents)} MAD</p>
        </div>
        <div className="mt-8 space-y-4">
          {order.tickets.map((ticket) => (
            <TicketPass key={ticket.id} {...toTicketPassProps(ticket)} />
          ))}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/billets" className="inline-flex h-12 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg transition hover:bg-primary-hover">
            {t("seeTickets")}
          </Link>
          <Link to="/explorer" className="inline-flex h-12 items-center rounded-full border border-line/20 bg-card px-5 text-sm font-semibold transition hover:bg-paper">
            {t("another")}
          </Link>
        </div>
      </div>
    </Shell>
  );
}

