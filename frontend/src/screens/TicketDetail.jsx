import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { QrMark } from "../components/QrMark";
import { Shell } from "../components/Shell";
import { seatLabel, ticketPayload } from "../components/TicketPass";
import { api, money } from "../api";
import { useI18n } from "../i18n";

export default function TicketDetail() {
  const { ticketId } = useParams();
  const { locale, t } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get(`/tickets/${ticketId}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [ticketId]);

  if (error) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="font-display text-3xl font-extrabold">{t("notFound")}</h1>
          <Link to="/billets" className="mt-4 inline-flex h-12 items-center rounded-full bg-lagon px-5 font-semibold text-foam">
            {t("seeTickets")}
          </Link>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <div className="mx-auto h-80 max-w-xl animate-pulse px-4 py-10" />
      </Shell>
    );
  }

  const { ticket, event, tier, order } = data;
  const title = locale === "ar" ? event.titleAr : event.titleFr;
  const venue = locale === "ar" ? event.venueAr : event.venueFr;
  const zone = locale === "ar" ? tier.zoneAr : tier.zoneFr;
  const gate = locale === "ar" ? tier.gateAr : tier.gateFr;
  const seat = seatLabel(ticket, locale);

  return (
    <Shell>
      <div className="mx-auto max-w-xl px-4 py-8">
        <div className="flex items-center justify-between no-print">
          <Link to="/billets" className="text-sm font-semibold text-lagon">
            {t("back")}
          </Link>
          <button type="button" className="h-11 rounded-full bg-encre px-4 text-sm font-semibold text-foam" onClick={() => window.print()}>
            {t("print")}
          </button>
        </div>
        <article className="mt-4 overflow-hidden rounded-2xl bg-card shadow-pop">
          {event.image ? <img src={event.image} alt="" className="h-44 w-full object-cover" /> : null}
          <div className="p-5">
            <p className="font-mono text-xs text-lagon">{ticket.ref}</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold">{title}</h1>
            <p className="mt-2 text-sm text-muted">{new Date(event.start).toLocaleDateString(locale === "ar" ? "ar-MA" : "fr-FR")}</p>
            <p className="font-semibold">{venue}</p>
            <p className="text-sm">
              {zone} · {gate}
            </p>
            <p className="text-sm">{seat ?? t("freeSeat")}</p>
            <p className="mt-2 text-sm">
              {t("holderOf")} · {ticket.holderName}
            </p>
            <div className="mt-4 flex justify-center rounded-xl bg-paper p-4">
              <QrMark value={ticketPayload(ticket, event.slug)} className="size-52" />
            </div>
            <p className="mt-2 text-center text-xs text-muted">{t("brightness")}</p>
            {ticket.status !== "VALID" ? (
              <p className="mt-3 text-center font-bold text-corail">
                {ticket.status === "TRANSFERRED" ? t("transferred") : ticket.status === "CANCELLED" ? t("cancelled") : t("used")}
              </p>
            ) : (
              <p className="mt-3 text-center font-bold text-lagon">{t("validEntry")}</p>
            )}
          </div>
        </article>
        <section className="mt-4 rounded-xl border border-line/10 bg-card p-4">
          <h2 className="font-display text-lg font-bold">{t("invoice")}</h2>
          <p className="mt-2 flex justify-between text-sm">
            <span>{t("subtotal")}</span>
            <span>{money(order.subtotalCents)} MAD</span>
          </p>
          <p className="flex justify-between text-sm">
            <span>{t("fees")}</span>
            <span>{t("feesFree")}</span>
          </p>
          <p className="flex justify-between text-sm">
            <span>{t("vat")}</span>
            <span>{t("included")}</span>
          </p>
          <p className="mt-2 flex justify-between font-display text-xl font-extrabold">
            <span>{t("totalDebited")}</span>
            <span>{money(order.totalCents)} MAD</span>
          </p>
          <p className="mt-2 font-mono text-xs text-muted">
            {order.paymentRef} · {order.cardBank} ···· {order.cardLast4}
          </p>
        </section>
      </div>
    </Shell>
  );
}
