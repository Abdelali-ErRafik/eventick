import { createFileRoute, Link } from "@tanstack/react-router";
import { QrMark } from "@/components/qr-mark";
import { Shell } from "@/components/shell";
import { seatLabel, ticketPayload } from "@/components/ticket-pass";
import { dateRange, money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { allTickets, useStore } from "@/lib/store";

export const Route = createFileRoute("/billet/$ticketId")({
  component: PassPage,
});

function PassPage() {
  const { ticketId } = Route.useParams();
  const { locale, t } = useI18n();
  const hydrated = useStore((state) => state.hydrated);
  const orders = useStore((state) => state.orders);
  const found = allTickets(orders).find((item) => item.ticket.id === ticketId);

  if (!hydrated) {
    return (
      <Shell>
        <div className="mx-auto h-80 max-w-xl animate-pulse px-4 py-10" />
      </Shell>
    );
  }

  if (!found) {
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

  const { ticket, order } = found;
  const title = locale === "ar" ? ticket.titleAr : ticket.titleFr;
  const venue = locale === "ar" ? ticket.venueAr : ticket.venueFr;
  const seat = seatLabel(ticket, locale);

  return (
    <Shell>
      <div className="mx-auto max-w-xl px-4 py-8">
        <div className="flex items-center justify-between no-print">
          <Link to="/billets" className="text-sm font-semibold text-lagon">
            {t("back")}
          </Link>
          <button className="h-11 rounded-full bg-encre px-4 text-sm font-semibold text-foam" onClick={() => window.print()}>
            {t("print")}
          </button>
        </div>
        <article className="mt-4 overflow-hidden rounded-2xl bg-card shadow-pop">
          <img src={ticket.image} alt="" className="h-44 w-full object-cover" />
          <div className="p-5">
            <p className="font-mono text-xs text-lagon">{ticket.ref}</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold">{title}</h1>
            <p className="mt-2 text-sm text-muted">
              {dateRange(ticket.start, ticket.end, locale)} · {ticket.time}
            </p>
            <p className="font-semibold">
              {venue}, {ticket.city}
            </p>
            <p className="text-sm">
              {locale === "ar" ? ticket.zoneAr : ticket.zoneFr} · {locale === "ar" ? ticket.gateAr : ticket.gateFr}
            </p>
            <p className="text-sm">{seat ?? t("freeSeat")}</p>
            <p className="mt-2 text-sm">
              {t("holderOf")} · {ticket.holder}
            </p>
            <div className="mt-4 flex justify-center rounded-xl bg-paper p-4">
              <QrMark value={ticketPayload(ticket)} className="size-52" />
            </div>
            <p className="mt-2 text-center text-xs text-muted">{t("brightness")}</p>
            {ticket.status !== "valid" ? (
              <p className="mt-3 text-center font-bold text-corail">{ticket.status === "transferred" ? t("transferred") : t("used")}</p>
            ) : (
              <p className="mt-3 text-center font-bold text-lagon">{t("validEntry")}</p>
            )}
          </div>
        </article>
        <section className="mt-4 rounded-xl border border-line/10 bg-card p-4">
          <h2 className="font-display text-lg font-bold">{t("invoice")}</h2>
          <p className="mt-2 flex justify-between text-sm">
            <span>{t("subtotal")}</span>
            <span>{money(order.subtotal, locale)}</span>
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
            <span>{money(order.total, locale)}</span>
          </p>
          <p className="mt-2 font-mono text-xs text-muted">
            {order.authCode} · {order.bank} ···· {order.last4}
          </p>
        </section>
      </div>
    </Shell>
  );
}
