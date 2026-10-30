import { useEffect, useState } from "react";
import { Calendar, Check, Download, MapPin, Ticket as TicketIcon } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Shell } from "../components/Shell";
import { TicketPass, toTicketPassProps } from "../components/TicketPass";
import { api, money, rememberOrderKey, rememberTicketOrder } from "../api";
import { useI18n } from "../i18n";
import { Container, ErrorState } from "../ui";
import { eventText, intlLocaleTag } from "../utils";

export default function Confirmation() {
  const { orderId } = useParams();
  const { locale, t } = useI18n();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // A buyer who opens this link on another device — or after clearing their
    // browser — has the token only in the URL, so adopt it before the fetch.
    // That is the whole reason the token travels in the link as well as in
    // local storage.
    const fromUrl = new URLSearchParams(window.location.search).get("k");
    if (fromUrl) rememberOrderKey(orderId, fromUrl);

    api
      .get(`/orders/${orderId}`)
      .then((data) => {
        setOrder(data.order);
        // Tickets are opened by ticket id, which carries no hint of which
        // order it belongs to. Record the link here so TicketDetail can find
        // the right credential later.
        for (const ticket of data.order?.tickets ?? []) rememberTicketOrder(ticket.id, orderId);
      })
      .catch((err) => setError(err.message));
  }, [orderId]);

  if (error) {
    return (
      <Shell>
        <Container size="narrow" className="py-16">
          <ErrorState title={t("orderNotFound")} body={t("orderNotFoundBody")} />
          <div className="mt-6 flex justify-center">
            <Link
              to="/billets"
              className="inline-flex h-12 items-center rounded-full bg-action px-5 text-sm font-semibold text-action-fg transition hover:bg-action-hover"
            >
              {t("seeTickets")}
            </Link>
          </div>
        </Container>
      </Shell>
    );
  }

  if (!order) {
    return (
      <Shell>
        <div className="animate-pulse bg-stage py-16">
          <Container size="form">
            <div className="mx-auto h-16 w-16 rounded-full bg-stage-fg/10" />
            <div className="mx-auto mt-5 h-8 w-64 rounded-control bg-stage-fg/10" />
            <div className="mx-auto mt-3 h-4 w-80 rounded-control bg-stage-fg/10" />
          </Container>
        </div>
        <Container size="form" className="py-8">
          <div className="h-48 rounded-card bg-card" />
        </Container>
      </Shell>
    );
  }

  const first = order.tickets[0];
  const event = first?.event;
  const title = event ? (eventText(event, "title", locale)) : null;
  const venue = event ? (eventText(event, "venue", locale)) : null;
  const count = order.tickets.length;
  const ticketsLabel = (count === 1 ? t("ticketsCount") : t("ticketsCountPlural")).replace("{n}", String(count));

  return (
    <Shell>
      {/*
        A real success moment, not a line of body text under a checkmark.
        Same dark-stage treatment as EventDetail's hero — the one other place
        in the app that commits a whole panel to "this is the thing that
        matters right now" — rather than this page inventing its own look
        for what is, for most buyers, the single most important screen they
        see.
      */}
      <section className="bg-stage py-12 text-stage-fg md:py-16">
        <Container size="form" className="text-center">
          <span className="mx-auto inline-flex size-16 items-center justify-center rounded-full bg-success text-success-fg shadow-pop">
            <Check className="size-8" strokeWidth={2.5} />
          </span>
          <h1 className="mt-5 font-display text-3xl font-extrabold md:text-4xl">{t("paid")}</h1>
          <p className="mt-2 text-stage-muted">{t("paidBody")}</p>

          {title ? (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-stage-fg/10 px-3.5 py-2">
                <Calendar className="size-4 text-accent" />
                {new Date(event.start).toLocaleDateString(intlLocaleTag(locale), {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </span>
              {venue ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-stage-fg/10 px-3.5 py-2">
                  <MapPin className="size-4 text-accent" />
                  {venue}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-2 rounded-full bg-stage-fg/10 px-3.5 py-2">
                <TicketIcon className="size-4 text-accent" />
                {ticketsLabel}
              </span>
            </div>
          ) : null}

          {/* Order meta as a stat row rather than one cramped monospace line
              — the amount is the thing a buyer checks against their bank
              statement, so it gets its own visual weight instead of sharing
              a line with two ids nobody reads at this moment. */}
          <div className="mx-auto mt-8 flex max-w-md flex-wrap items-center justify-center gap-x-8 gap-y-4 border-t border-stage-fg/10 pt-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stage-muted">{t("orderRef")}</p>
              <p className="font-mono text-sm font-semibold">{order.id}</p>
            </div>
            <div className="h-9 w-px bg-stage-fg/10" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stage-muted">{t("auth")}</p>
              <p className="font-mono text-sm font-semibold">{order.paymentRef}</p>
            </div>
          </div>
          <p className="mt-4 font-display text-3xl font-extrabold tabular-nums">{money(order.totalCents)} MAD</p>
        </Container>
      </section>

      <Container size="form" className="py-8 md:py-10">
        <div className="space-y-4">
          {order.tickets.map((ticket) => (
            <TicketPass key={ticket.id} {...toTicketPassProps(ticket)} />
          ))}
        </div>

        {/* Primary/secondary pairing: the next thing most buyers actually do
            is go find their ticket again later, not immediately shop for
            another event. The old pair gave both equal weight. */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/billets"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-action px-6 text-sm font-semibold text-action-fg transition hover:bg-action-hover"
          >
            <Download className="size-4" />
            {t("seeTickets")}
          </Link>
          <Link
            to="/explorer"
            className="inline-flex h-12 items-center rounded-full border border-line/20 bg-card px-6 text-sm font-semibold transition hover:bg-paper"
          >
            {t("another")}
          </Link>
        </div>
      </Container>
    </Shell>
  );
}
