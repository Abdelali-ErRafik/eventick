import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { fillRatio, minPrice, remainingOf, type BadgeId, type EventItem } from "@/lib/catalog";
import { groupNumber, money, monthBadge } from "@/lib/format";
import { categoryLabel, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { eventTitle, eventVenue } from "@/lib/use-catalog";
import { cn } from "@/lib/utils";

const BADGE: Record<BadgeId, { fr: string; ar: string; className: string }> = {
  gold: { fr: "Pass gold limité", ar: "ذهبي محدود", className: "bg-safran text-encre" },
  last: { fr: "Dernières places", ar: "آخر المقاعد", className: "bg-corail text-foam" },
  flash: { fr: "Vente flash", ar: "بيع خاطف", className: "bg-safran text-encre" },
  new: { fr: "Nouveau", ar: "جديد", className: "bg-lagon text-foam" },
  hot: { fr: "Jauge haute", ar: "إقبال عالٍ", className: "bg-corail text-foam" },
  vip: { fr: "Pass pro & VIP", ar: "شارة برو", className: "bg-encre text-foam" },
};

export function EventCard({
  event,
  variant = "grid",
}: {
  event: EventItem;
  variant?: "grid" | "feature" | "compact" | "weekend";
}) {
  const { locale, t, tf } = useI18n();
  const sold = useStore((state) => state.sold);
  const stamp = monthBadge(event.start, locale);
  const price = minPrice(event);
  const ratio = fillRatio(event, sold);
  const left = remainingOf(event, sold);
  const badge = event.badge ? BADGE[event.badge] : null;
  const title = eventTitle(event, locale);
  const venue = eventVenue(event, locale);

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-line/10 bg-card shadow-card transition hover:-translate-y-0.5 hover:shadow-pop",
        variant === "feature" && "md:flex-row",
      )}
    >
      <Link
        to="/evenements/$slug"
        params={{ slug: event.slug }}
        className={cn("relative block overflow-hidden", variant === "feature" ? "md:w-3/5" : "")}
      >
        <img
          src={event.image}
          alt=""
          className={cn(
            "w-full object-cover object-center transition duration-300 group-hover:scale-[1.03]",
            variant === "compact" ? "h-40" : variant === "feature" ? "h-72 md:h-80" : "h-48",
          )}
        />
        <span className="absolute start-3 top-3 flex w-14 flex-col items-center rounded-lg bg-card px-2 py-1 text-encre shadow-card">
          <span className="font-mono text-xs font-bold tracking-widest text-muted">{stamp.month}</span>
          <span className="font-display text-xl font-extrabold leading-none text-safran-deep">{stamp.day}</span>
        </span>
        {badge ? (
          <span className={cn("absolute end-3 top-3 rounded-md px-2 py-1 text-xs font-bold", badge.className)}>
            {locale === "ar" ? badge.ar : badge.fr}
          </span>
        ) : null}
      </Link>
      <div className={cn("flex flex-1 flex-col gap-3 p-4", variant === "feature" && "justify-end md:p-6")}>
        <p className="font-mono text-xs font-bold tracking-widest text-lagon">
          {categoryLabel(event.category, t)} · {event.city}
        </p>
        <Link to="/evenements/$slug" params={{ slug: event.slug }}>
          <h3 className={cn("font-display font-bold leading-tight text-encre", variant === "feature" ? "text-3xl" : "text-xl")}>
            {title}
          </h3>
        </Link>
        <p className="flex items-center gap-1 text-sm text-muted">
          <MapPin className="size-4 shrink-0" aria-hidden />
          <span>
            {venue}, {event.city}
          </span>
        </p>
        {variant === "weekend" ? (
          <div>
            <div className="mb-1 flex justify-between font-mono text-xs text-muted">
              <span>
                {Math.round(ratio * 100)}% {t("soldWord")}
              </span>
              <span>{tf("left", { n: groupNumber(left) })}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-brume">
              <div
                className={cn("h-full rounded-full", ratio > 0.82 ? "bg-corail" : "bg-lagon")}
                style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
              />
            </div>
          </div>
        ) : null}
        <div className="mt-auto flex items-end justify-between gap-3 pt-1">
          <p>
            <span className="block text-xs text-muted">{t("from")}</span>
            <span className="font-display text-2xl font-extrabold tabular-nums text-encre">{money(price, locale)}</span>
          </p>
          <Link
            to="/evenements/$slug"
            params={{ slug: event.slug }}
            className={cn(
              "inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold",
              variant === "feature" ? "bg-safran text-encre" : "bg-lagon text-foam",
            )}
          >
            {variant === "weekend" ? t("buy") : t("reserve")}
          </Link>
        </div>
      </div>
    </article>
  );
}
