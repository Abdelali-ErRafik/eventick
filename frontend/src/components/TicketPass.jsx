import { Link } from "react-router-dom";
import { QrMark } from "./QrMark";
import { money } from "../api";
import { useI18n } from "../i18n";
import { Badge } from "../ui";
import { intlLocaleTag } from "../utils";

export function seatLabel(ticket, locale) {
  if (!ticket.seatRow || !ticket.seatNumber) return null;
  const row = String(ticket.seatRow).padStart(2, "0");
  return locale === "ar" ? `الصف ${row} · المقعد ${ticket.seatNumber}` : `Rang ${row} · Place ${ticket.seatNumber}`;
}

// The QR payload is HMAC-signed server-side and arrives on the ticket, so the
// client can render it but cannot mint one. A ticket without a payload gets no
// QR rather than an unverifiable placeholder.

// Reshapes GET /orders' and GET /orders/:id's enriched ticket shape
// (publicTicketWithContext on the backend) into the {ticket, event, tier,
// priceCents, qrPayload} props TicketPass expects.
export function toTicketPassProps(item) {
  return {
    ticket: { id: item.id, ref: item.ref, holderName: item.holderName, seatRow: item.seatRow, seatNumber: item.seatNumber },
    event: { titleFr: item.event.titleFr, titleAr: item.event.titleAr, venueFr: item.event.venueFr, venueAr: item.event.venueAr, start: item.event.start },
    tier: { nameFr: item.tierNameFr, nameAr: item.tierNameAr, zoneFr: item.zoneFr, zoneAr: item.zoneAr, gateFr: item.gateFr, gateAr: item.gateAr },
    priceCents: item.priceCents,
    qrPayload: item.qrPayload,
  };
}

// `ticket`, `event`, `tier` match GET /api/tickets/:id's response shape.
export function TicketPass({ ticket, event, tier, priceCents, qrPayload }) {
  const { locale, t } = useI18n();
  const title = locale === "ar" ? event.titleAr : event.titleFr;
  const venue = locale === "ar" ? event.venueAr : event.venueFr;
  const zone = locale === "ar" ? tier.zoneAr : tier.zoneFr;
  const gate = locale === "ar" ? tier.gateAr : tier.gateFr;
  const tierName = locale === "ar" ? tier.nameAr : tier.nameFr;
  const seat = seatLabel(ticket, locale);

  return (
    <article className="overflow-hidden rounded-card border border-line/10 bg-card shadow-card">
      <div className="grid lg:grid-cols-[1fr_17rem]">
        {/* Stub */}
        <div className="min-w-0 p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="primary">{tierName}</Badge>
            <span className="font-mono text-xs text-muted">
              {t("ref")} {ticket.ref}
            </span>
          </div>

          <p className="mt-5 text-sm font-semibold text-primary">
            {new Date(event.start).toLocaleDateString(intlLocaleTag(locale), {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <h2 className="mt-1 font-display text-title font-extrabold">{title}</h2>

          <dl className="mt-5 grid gap-2.5 sm:grid-cols-2">
            <Meta label={t("venue")} value={venue} hint={gate} />
            <Meta label={t("zone")} value={zone} hint={seat ?? t("freeSeat")} />
            <Meta label={t("holderOf")} value={ticket.holderName} />
            {priceCents != null ? <Meta label={t("paidPrice")} value={`${money(priceCents)} MAD`} /> : null}
          </dl>

          <div className="no-print mt-5">
            <Link
              to={`/billet/${ticket.id}`}
              className="inline-flex h-11 items-center rounded-full border border-line/20 bg-card px-5 text-sm font-semibold text-ink transition hover:bg-paper"
            >
              {t("showPass")}
            </Link>
          </div>
        </div>

        {/*
          The QR panel, separated by a perforation. The notches and the dashed
          rule are what make this read as a ticket rather than as another card
          — the only place in the app where that is the point.
        */}
        <div className="relative flex flex-col items-center justify-center gap-3 border-t border-dashed border-line/25 bg-brume/40 p-5 lg:border-s lg:border-t-0">
          {/*
            Perforation notches. Centred with inset-inline + margin:auto rather
            than `start-1/2 -translate-x-1/2`, because a negative translate-x
            does NOT mirror under RTL — the notch drifted off-centre in Arabic.
            This approach has no horizontal transform to mirror.
          */}
          <span
            className="absolute -top-2.5 inset-inline-0 mx-auto size-5 rounded-full bg-paper lg:inset-inline-auto lg:top-0 lg:-mt-2.5 lg:-ms-2.5 lg:start-0"
            aria-hidden
          />
          <span
            className="absolute -bottom-2.5 inset-inline-0 mx-auto size-5 rounded-full bg-paper lg:inset-inline-auto lg:bottom-0 lg:-mb-2.5 lg:-ms-2.5 lg:start-0"
            aria-hidden
          />

          <Badge tone="success">{t("validEntry")}</Badge>
          <div className="rounded-control bg-white p-2.5 shadow-card">
            <QrMark value={qrPayload} />
          </div>
          <p className="max-w-48 text-center text-xs leading-relaxed text-muted">{t("brightness")}</p>
        </div>
      </div>
    </article>
  );
}

export function Meta({ label, value, hint }) {
  return (
    <div className="min-w-0 rounded-control bg-paper px-3.5 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="truncate font-semibold">{value}</dd>
      {hint ? <dd className="truncate text-sm text-muted">{hint}</dd> : null}
    </div>
  );
}
