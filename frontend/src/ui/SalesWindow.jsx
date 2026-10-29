import { DateField, TimeField } from "./DateField.jsx";
import { Field } from "./Field.jsx";

/**
 * An optional "on sale from … until …" pair for one ticket tier.
 *
 * Both bounds are genuinely optional and independent: an opening alone
 * schedules a drop, a closing alone sets a deadline, and neither means the
 * tier is on sale for as long as the event is. So this never forces a pair —
 * but the time pickers stay disabled until a date is picked, because a time
 * with no date reads as a bound that is silently not sent. Clearing the date
 * is how a bound is removed.
 *
 * Used by the event form (Organiser) and the zone editor (Placements), which
 * is why it lives here rather than beside either of them.
 */
export function SalesWindow({
  title,
  hint,
  locale,
  labels,
  openDate,
  openTime,
  closeDate,
  closeTime,
  onOpenDate,
  onOpenTime,
  onCloseDate,
  onCloseTime,
  className,
}) {
  return (
    <div className={className ?? "rounded-control border border-line/10 bg-paper/60 p-3"}>
      {title ? <p className="text-[13px] font-semibold text-ink">{title}</p> : null}
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      <div className={`${title || hint ? "mt-3 " : ""}grid gap-3 sm:grid-cols-2`}>
        <Field label={labels.opens}>
          {({ id, describedBy }) => (
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <DateField id={id} describedBy={describedBy} locale={locale} value={openDate} onChange={onOpenDate} />
              </div>
              <div className="w-28 shrink-0">
                <TimeField value={openTime} onChange={onOpenTime} disabled={!openDate} />
              </div>
            </div>
          )}
        </Field>
        <Field label={labels.closes}>
          {({ id, describedBy }) => (
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <DateField
                  id={id}
                  describedBy={describedBy}
                  locale={locale}
                  value={closeDate}
                  // Stops the organiser setting a window they would only
                  // learn was invalid when the server refused the save.
                  min={openDate || undefined}
                  onChange={onCloseDate}
                />
              </div>
              <div className="w-28 shrink-0">
                <TimeField value={closeTime} onChange={onCloseTime} disabled={!closeDate} />
              </div>
            </div>
          )}
        </Field>
      </div>
      {openDate || closeDate ? (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-primary hover:underline"
          onClick={() => {
            onOpenDate("");
            onCloseDate("");
          }}
        >
          {labels.reset}
        </button>
      ) : null}
    </div>
  );
}

/**
 * "YYYY-MM-DD" + "HH:mm" -> the ISO string the tier endpoints accept, or null
 * when no date is set.
 *
 * The "Z" is not optional. Both tier schemas use `z.string().datetime()`,
 * which takes UTC only: a bare "2026-12-20T09:00:00" is a 400, and so is an
 * offset like "+01:00". Treating the typed wall-clock as UTC also keeps the
 * window comparable to the event's own start, which is stored the same naive
 * way — converting to a real Morocco offset would put the window an hour out
 * from the event time shown beside it.
 */
export function salesWindowAt(date, time) {
  return date ? `${date}T${time || "00:00"}:00Z` : null;
}

/** An ISO timestamp from the API -> the {date, time} pair the pickers use. */
export function splitSalesWindow(iso, fallbackTime = "09:00") {
  if (!iso) return { date: "", time: fallbackTime };
  // The stored value is UTC and was typed as wall-clock, so it is read back
  // the same way — slicing the ISO string rather than going through a local
  // Date, which would shift it by the machine's offset.
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) || fallbackTime };
}
