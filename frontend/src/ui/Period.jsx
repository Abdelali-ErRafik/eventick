import { cn } from "../utils.js";

/**
 * The reporting-period control, and the bar chart that goes under it.
 *
 * Every money figure in the dashboard used to be LIFETIME — net revenue,
 * refunds, commission, per-event takings. That answers "how have we done
 * ever", which nobody asks twice, and left "how did October go" unanswerable.
 *
 * Shared rather than written inline on each screen: Finance and Platform both
 * need it, and the segmented-toggle pattern was already hand-rolled in Gate
 * with its own class strings. A third copy is how a component layer rots.
 *
 * The keys match the server's PeriodKey union exactly (domain/period.ts); a
 * value this does not know falls back to "all" there rather than erroring.
 */

export const PERIOD_KEYS = ["today", "week", "month", "lastMonth", "year", "all"];

/**
 * A segmented control, not a dropdown.
 *
 * Six options that are all one word: showing them costs one row and saves a
 * click, and the current period stays visible while reading the figures it
 * produced — which is the whole point of putting it above them.
 */
export function PeriodPicker({ value, onChange, labels, className }) {
  return (
    <div
      role="group"
      aria-label={labels.ariaLabel}
      className={cn("inline-flex flex-wrap items-center gap-1 rounded-full bg-paper p-1 text-xs font-bold", className)}
    >
      {PERIOD_KEYS.map((key) => {
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            // aria-pressed, not aria-selected: these are toggle buttons in a
            // group, not tabs over panels.
            aria-pressed={active}
            className={cn(
              "rounded-full px-3 py-1.5 transition",
              active ? "bg-card text-encre shadow-card" : "text-muted hover:text-encre",
            )}
          >
            {labels[key]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Change against the previous period, as a signed percentage.
 *
 * Returns null where a percentage would mislead rather than inform: with no
 * previous period (all time), and when the previous period was zero — "up
 * ∞%" from nothing is not a trend, it is a first sale.
 */
export function deltaPct(current, previous) {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Revenue over time, drawn in divs.
 *
 * No charting library: these are plain bars with a shared maximum, which is
 * all "when did sales actually happen" needs. A dependency would add bundle
 * weight and a second styling system to a dashboard that has neither.
 *
 * Bars are gross, matching the server — a refund processed in November
 * against an October sale would otherwise dig a hole in October, which is not
 * when anything went wrong.
 */
export function RevenueBars({ series, labels, formatAmount, formatDate, className }) {
  if (!series?.length) return null;

  const peak = Math.max(...series.map((point) => point.grossCents), 0);
  // Every bar at full height would imply a flat line rather than no data.
  if (peak === 0) {
    return <p className={cn("text-xs text-muted", className)}>{labels.empty}</p>;
  }

  return (
    <div className={className}>
      <div className="flex h-28 items-end gap-px" role="img" aria-label={labels.chartAlt}>
        {series.map((point) => {
          const ratio = point.grossCents / peak;
          return (
            <div
              key={point.start}
              className="group relative flex-1"
              // The accessible name of each bar, so the series is readable
              // without the chart: screen readers get the figure, sighted
              // users get the same text on hover.
              title={`${formatDate(point.start)} · ${formatAmount(point.grossCents)}`}
            >
              <div
                className={cn(
                  "w-full rounded-t-sm transition group-hover:bg-primary",
                  point.grossCents > 0 ? "bg-primary/60" : "bg-line/20",
                )}
                // A sale of any size gets at least 2% height, or a quiet day
                // beside a busy one renders as nothing and reads as missing
                // data rather than a small number.
                style={{ height: `${point.grossCents > 0 ? Math.max(2, ratio * 100) : 1}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted">
        <span>{formatDate(series[0].start)}</span>
        <span className="font-semibold">{formatAmount(peak)}</span>
        <span>{formatDate(series[series.length - 1].start)}</span>
      </div>
    </div>
  );
}
