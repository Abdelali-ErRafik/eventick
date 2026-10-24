import { Link } from "@tanstack/react-router";
import { QrMark } from "@/components/qr-mark";
import { dateRange, money, type Locale } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Ticket } from "@/lib/store";

export function seatLabel(ticket: Ticket, locale: Locale) {
  if (!ticket.seatRow || !ticket.seatNum) return null;
  const row = String(ticket.seatRow).padStart(2, "0");
  return locale === "ar" ? `الصف ${row} · المقعد ${ticket.seatNum}` : `Rang ${row} · Place ${ticket.seatNum}`;
}

export function ticketPayload(ticket: Ticket) {
  return `EVENTICK|${ticket.ref}|${ticket.eventSlug}|${ticket.holder}`;
}

export function TicketPass({ ticket, compact = false }: { ticket: Ticket; compact?: boolean }) {
  const { locale, t } = useI18n();
  const title = locale === "ar" ? ticket.titleAr : ticket.titleFr;
  const venue = locale === "ar" ? ticket.venueAr : ticket.venueFr;
  const zone = locale === "ar" ? ticket.zoneAr : ticket.zoneFr;
  const gate = locale === "ar" ? ticket.gateAr : ticket.gateFr;
  const tier = locale === "ar" ? ticket.tierAr : ticket.tierFr;
  const seat = seatLabel(ticket, locale);

  if (compact) {
    return (
      <article className="flex gap-3 rounded-xl border border-line/10 bg-card p-3 shadow-card">
        <img src={ticket.image} alt="" className="size-20 rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-lagon">{tier}</p>
          <h3 className="truncate font-display text-lg font-bold">{title}</h3>
          <p className="text-sm text-muted">
            {venue}, {ticket.city}
          </p>
          <p className="text-sm">{dateRange(ticket.start, ticket.end, locale)} · {ticket.time}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-xl border border-line/10 bg-card shadow-card">
      <div className="grid lg:grid-cols-[1fr_16rem]">
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-lagon px-3 py-1 text-xs font-bold text-foam">{tier}</span>
            <span className="font-mono text-xs text-muted">
              {t("ref")} {ticket.ref}
            </span>
          </div>
          <p className="mt-4 text-sm font-semibold text-lagon">{dateRange(ticket.start, ticket.end, locale)} · {ticket.time}</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-encre md:text-3xl">{title}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Meta label={t("venue")} value={venue} hint={`${ticket.city} · ${gate}`} />
            <Meta label={t("zone")} value={zone} hint={seat ?? t("freeSeat")} />
            <Meta label={t("holderOf")} value={ticket.holder} />
            <Meta label={t("paidPrice")} value={money(ticket.price, locale)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 no-print">
            <Link to="/billet/$ticketId" params={{ ticketId: ticket.id }} className="inline-flex h-11 items-center rounded-full bg-encre px-4 text-sm font-semibold text-foam">
              {t("showPass")}
            </Link>
            <a
              className="inline-flex h-11 items-center rounded-full border border-line/15 px-4 text-sm font-semibold"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue}, ${ticket.address}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              {t("route")}
            </a>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 border-t border-dashed border-line/20 bg-brume/40 p-5 lg:border-s lg:border-t-0">
          <span className="rounded-full bg-lagon px-3 py-1 text-xs font-bold text-foam">{t("validEntry")}</span>
          <div className="rounded-xl bg-card p-2 shadow-card">
            <QrMark value={ticketPayload(ticket)} />
          </div>
          <p className="max-w-48 text-center font-mono text-xs text-muted">{t("brightness")}</p>
        </div>
      </div>
    </article>
  );
}

function Meta({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-paper px-3 py-2">
      <p className="font-mono text-xs tracking-wide text-muted">{label}</p>
      <p className="font-semibold text-encre">{value}</p>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}
