import { Link } from "react-router-dom";
import { CalendarDays, MapPin } from "lucide-react";
import { money } from "../api";
import { categoryLabel, useI18n } from "../i18n";
import { Badge } from "../ui";
import { cn, fillRatio, groupNumber, minPriceCents, monthBadge, totalRemaining } from "../utils";

/**
 * An event in a list.
 *
 * Two things were wrong beyond the styling. The badge labels were hardcoded
 * French and Arabic strings inside this file, so the English build showed
 * French; they are i18n keys now. And the call-to-action changed colour by
 * variant — Safran on the feature card, Lagon everywhere else — which is part
 * of why the site had no learnable "go" colour.
 *
 * The whole card is one link. Previously the image, the title and the button
 * were three separate links to the same place, so a keyboard user tabbed
 * through the same destination three times per card.
 */

const BADGE_TONES = {
  gold: { key: "badgeGold", tone: "accent" },
  last: { key: "badgeLast", tone: "danger" },
  flash: { key: "badgeFlash", tone: "accent" },
  new: { key: "badgeNew", tone: "primary" },
  hot: { key: "badgeHot", tone: "danger" },
  vip: { key: "badgeVip", tone: "neutral" },
};

export function EventCard({ event, variant = "grid" }) {
  const { locale, t, tf } = useI18n();

  const stamp = monthBadge(event.start, locale);
  const priceCents = minPriceCents(event);
  const ratio = fillRatio(event);
  const left = totalRemaining(event);
  const badge = event.badge ? BADGE_TONES[event.badge] : null;
  const title = locale === "ar" ? event.titleAr : event.titleFr;
  const venue = locale === "ar" ? event.venueAr : event.venueFr;

  const feature = variant === "feature";
  const compact = variant === "compact";

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-line/10 bg-card shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-pop">
      <div className={cn("flex flex-1 flex-col", feature && "md:flex-row")}>
        <div className={cn("relative shrink-0 overflow-hidden", feature && "md:w-[55%]")}>
          <img
            src={event.image}
            alt=""
            loading="lazy"
            className={cn(
              "w-full object-cover object-center transition duration-500 group-hover:scale-[1.04]",
              compact ? "h-40" : feature ? "h-64 md:h-full md:min-h-[22rem]" : "h-48",
            )}
          />
          {/* Date stamp. Readable over any photo because it sits on card, not
              on a translucent wash. */}
          <span className="absolute start-3 top-3 flex w-14 flex-col items-center rounded-control bg-card px-2 py-1.5 shadow-card">
            <span className="font-mono text-[11px] font-bold tracking-widest text-muted">{stamp.month}</span>
            <span className="font-display text-xl font-extrabold leading-none text-ink">{stamp.day}</span>
          </span>
          {badge ? (
            <Badge tone={badge.tone} className="absolute end-3 top-3 shadow-card">
              {t(badge.key)}
            </Badge>
          ) : null}
        </div>

        <div className={cn("flex flex-1 flex-col gap-2.5 p-4", feature && "justify-center md:p-7")}>
          <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-primary">
            {categoryLabel(event.category, t)}
          </p>

          <h3 className={cn("font-display font-bold leading-tight", feature ? "text-title" : "text-subhead")}>{title}</h3>

          <p className="flex items-start gap-1.5 text-sm text-muted">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0">
              {venue}, {event.city}
            </span>
          </p>

          {feature ? (
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <CalendarDays className="size-4 shrink-0" aria-hidden />
              {new Date(event.start).toLocaleDateString(locale === "ar" ? "ar-MA" : "fr-MA", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          ) : null}

          {variant === "weekend" ? (
            <div className="mt-1">
              <div className="mb-1.5 flex justify-between font-mono text-[11px] text-muted">
                <span>
                  {Math.round(ratio * 100)}% {t("soldWord")}
                </span>
                <span>{tf("left", { n: groupNumber(left) })}</span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-brume"
                role="progressbar"
                aria-valuenow={Math.round(ratio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t("soldWord")}
              >
                <div
                  // "% sold" is a status, not a brand moment -- same bug as
                  // StockCell's healthy-stock bar, fixed the same way.
                  className={cn("h-full rounded-full transition-[width]", ratio > 0.82 ? "bg-danger" : "bg-success")}
                  style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                />
              </div>
            </div>
          ) : null}

          <div className="mt-auto flex items-end justify-between gap-3 pt-2">
            <p className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{t("from")}</span>
              <span className="font-display text-heading font-extrabold tabular-nums">{money(priceCents)} MAD</span>
            </p>
            {/* Styled as a button, but it is the card's own link — see below.
                A real CTA, so the action pill, not the brand colour. */}
            <span className="inline-flex h-11 shrink-0 items-center rounded-full bg-action px-5 text-sm font-semibold text-action-fg transition group-hover:bg-action-hover">
              {t("reserve")}
            </span>
          </div>
        </div>
      </div>

      {/*
        One link covering the whole card, stretched over it rather than
        wrapping it — so the card is a single tab stop and a single large
        target, while the markup above stays semantic.
      */}
      <Link
        to={`/evenements/${event.slug}`}
        className="absolute inset-0 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="sr-only">
          {title} — {venue}, {event.city}
        </span>
      </Link>
    </article>
  );
}
