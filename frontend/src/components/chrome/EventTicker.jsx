import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Flame } from "lucide-react";
import { useI18n } from "../../i18n";
import { cn, daysUntil } from "../../utils";

const URGENCY_TONE = {
  last: "text-danger-fg bg-danger",
  flash: "text-accent-fg bg-accent",
  hot: "text-danger-fg bg-danger",
};

const URGENCY_LABEL_KEY = {
  last: "badgeLast",
  flash: "badgeFlash",
  hot: "badgeHot",
};

/**
 * A thin rotating strip above the main header row — the one place in the
 * chrome that carries live content instead of pure navigation. Ticketing
 * sites live or die on urgency ("last seats", "starts tomorrow"); the
 * header had zero signal of that before this, just logo + links + search.
 *
 * Only shows when there is something genuinely urgent to say — an event
 * with a last/flash/hot badge, or one starting within 3 days. Silent
 * otherwise, so it never invents urgency that isn't there.
 */
export function EventTicker({ events, onImage }) {
  const { locale, t, tf } = useI18n();
  const [index, setIndex] = useState(0);

  const items = useMemo(() => {
    const today = Date.now();
    return events
      .filter((event) => new Date(event.start).getTime() >= today)
      .map((event) => ({ event, left: daysUntil(event.start) }))
      .filter(({ event, left }) => URGENCY_LABEL_KEY[event.badge] || left <= 3)
      .sort((a, b) => a.left - b.left)
      .slice(0, 6);
  }, [events]);

  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setIndex((current) => (current + 1) % items.length), 4500);
    return () => clearInterval(id);
  }, [items.length]);

  if (items.length === 0) return null;

  const { event, left } = items[index % items.length];
  const title = locale === "ar" ? event.titleAr : event.titleFr;
  const urgencyKey = URGENCY_LABEL_KEY[event.badge];
  const countdown = left <= 0 ? t("nextToday") : left === 1 ? t("nextTomorrow") : tf("daysLeft", { n: left });

  return (
    <div
      className={cn(
        "relative z-10 border-b transition-colors duration-200",
        onImage ? "border-stage-fg/10 bg-stage-fg/5" : "border-line/10 bg-brume/60",
      )}
    >
      <Link
        to={`/evenements/${event.slug}`}
        className="mx-auto flex h-9 max-w-7xl items-center gap-2 px-4 text-xs font-semibold transition hover:opacity-80 md:px-8"
      >
        <Flame className="size-3.5 shrink-0 text-danger" aria-hidden />
        {urgencyKey ? (
          <span className={cn("hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide sm:inline", URGENCY_TONE[event.badge])}>
            {t(urgencyKey)}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{title}</span>
        <span className={cn("shrink-0", onImage ? "text-accent" : "text-primary")}>{countdown}</span>
      </Link>
    </div>
  );
}
