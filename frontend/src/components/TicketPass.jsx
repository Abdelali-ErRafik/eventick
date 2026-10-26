import { Link } from "react-router-dom";
import { QrMark } from "./QrMark";
import { money } from "../api";
import { useI18n } from "../i18n";

export function seatLabel(ticket, locale) {
  if (!ticket.seatRow || !ticket.seatNumber) return null;
  const row = String(ticket.seatRow).padStart(2, "0");
  return locale === "ar" ? `الصف ${row} · المقعد ${ticket.seatNumber}` : `Rang ${row} · Place ${ticket.seatNumber}`;
}

export function ticketPayload(ticket, eventSlug) {
  return `EVENTICK|${ticket.ref}|${eventSlug}|${ticket.holderName}`;
}

// Reshapes GET /orders' and GET /orders/:id's enriched ticket shape
// (publicTicketWithContext on the backend) into the {ticket, event, tier,
// eventSlug, priceCents} props TicketPass expects.
export function toTicketPassProps(item) {
  return {
    ticket: { id: item.id, ref: item.ref, holderName: item.holderName, seatRow: item.seatRow, seatNumber: item.seatNumber },
    event: { titleFr: item.event.titleFr, titleAr: item.event.titleAr, venueFr: item.event.venueFr, venueAr: item.event.venueAr, start: item.event.start },
    tier: { nameFr: item.tierNameFr, nameAr: item.tierNameAr, zoneFr: item.zoneFr, zoneAr: item.zoneAr, gateFr: item.gateFr, gateAr: item.gateAr },
    eventSlug: item.event.slug,
    priceCents: item.priceCents,
  };
}

// `ticket`, `event`, `tier` match GET /api/tickets/:id's response shape.
export function TicketPass({ ticket, event, tier, eventSlug, priceCents }) {
  const { locale, t } = useI18n();
  const title = locale === "ar" ? event.titleAr : event.titleFr;
  const venue = locale === "ar" ? event.venueAr : event.venueFr;
  const zone = locale === "ar" ? tier.zoneAr : tier.zoneFr;
  const gate = locale === "ar" ? tier.gateAr : tier.gateFr;
  const tierName = locale === "ar" ? tier.nameAr : tier.nameFr;
  const seat = seatLabel(ticket, locale);

  return (
    <article className="overflow-hidden rounded-xl border border-line/10 bg-card shadow-card">
      <div className="grid lg:grid-cols-[1fr_16rem]">
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-lagon px-3 py-1 text-xs font-bold text-foam">{tierName}</span>
            <span className="font-mono text-xs text-muted">
              {t("ref")} {ticket.ref}
            </span>
          </div>
          <p className="mt-4 text-sm font-semibold text-lagon">
            {new Date(event.start).toLocaleDateString(locale === "ar" ? "ar-MA" : "fr-FR")}
          </p>
          <h2 className="mt-1 font-display text-2xl font-extrabold text-encre md:text-3xl">{title}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Meta label={t("venue")} value={venue} hint={gate} />
            <Meta label={t("zone")} value={zone} hint={seat ?? t("freeSeat")} />
            <Meta label={t("holderOf")} value={ticket.holderName} />
            {priceCents != null ? <Meta label={t("paidPrice")} value={`${money(priceCents)} MAD`} /> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 no-print">
            <Link to={`/billet/${ticket.id}`} className="inline-flex h-11 items-center rounded-full bg-encre px-4 text-sm font-semibold text-foam">
              {t("showPass")}
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 border-t border-dashed border-line/20 bg-brume/40 p-5 lg:border-s lg:border-t-0">
          <span className="rounded-full bg-lagon px-3 py-1 text-xs font-bold text-foam">{t("validEntry")}</span>
          <div className="rounded-xl bg-card p-2 shadow-card">
            <QrMark value={ticketPayload(ticket, eventSlug)} />
          </div>
          <p className="max-w-48 text-center font-mono text-xs text-muted">{t("brightness")}</p>
        </div>
      </div>
    </article>
  );
}

function Meta({ label, value, hint }) {
  return (
    <div className="rounded-xl bg-paper px-3 py-2">
      <p className="font-mono text-xs tracking-wide text-muted">{label}</p>
      <p className="font-semibold text-encre">{value}</p>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}
