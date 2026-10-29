import { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Popover } from "./Popover.jsx";
import { triggerControlClass } from "./Field.jsx";
import { cn } from "../utils.js";

/**
 * Date and time pickers that belong to this app rather than to the browser.
 *
 * `<input type="date">` and `<input type="time">` open Chrome's own calendar
 * and spinner: a light panel with OS highlight colours that ignores the app
 * theme completely, formats the date as 12/20/2026 regardless of locale, and
 * offers AM/PM to an audience that does not use it. On the dark event form
 * they were the one control that broke the moment you touched it — the same
 * problem ui/Dropdown.jsx was built to solve for <select>.
 *
 * Both keep the SAME value shapes the native inputs used — "YYYY-MM-DD" and
 * "HH:mm", 24-hour — so every caller, and the publish payload built from
 * them, is unchanged.
 */

/** Days in a month, where `month` is 1-12. */
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Weekday of the 1st, as a Monday-first index (0 = Monday). */
function firstWeekdayMondayFirst(year, month) {
  const sunday0 = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return (sunday0 + 6) % 7;
}

const pad = (n) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" -> {year, month, day}, or today when empty/unparseable. */
function parseKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? "");
  if (!match) {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * A date picker. `value`/`onChange` speak "YYYY-MM-DD", exactly as
 * <input type="date"> did.
 */
export function DateField({ id, value, onChange, describedBy, invalid, required, locale = "fr", min, disabled }) {
  const selected = parseKey(value);
  // The month on screen, which moves independently of the selection: you
  // can page through to next year without losing what is already chosen.
  const [view, setView] = useState({ year: selected.year, month: selected.month });

  const dtf = new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : locale === "en" ? "en-GB" : "fr-MA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const monthLabel = new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : locale === "en" ? "en-GB" : "fr-MA", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(view.year, view.month - 1, 1)));

  // Monday-first: the week starts on Monday in Morocco and across Europe,
  // which the native picker's Sunday-first grid got wrong.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-MA" : locale === "en" ? "en-GB" : "fr-MA", { weekday: "short" })
      // 2024-01-01 was a Monday, so this walks Mon..Sun.
      .format(new Date(Date.UTC(2024, 0, 1 + i))),
  );

  const step = (delta) => {
    setView((v) => {
      const m = v.month + delta;
      if (m < 1) return { year: v.year - 1, month: 12 };
      if (m > 12) return { year: v.year + 1, month: 1 };
      return { year: v.year, month: m };
    });
  };

  const total = daysInMonth(view.year, view.month);
  const lead = firstWeekdayMondayFirst(view.year, view.month);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];

  const isSelected = (day) =>
    Boolean(value) && selected.year === view.year && selected.month === view.month && selected.day === day;

  const keyFor = (day) => `${view.year}-${pad(view.month)}-${pad(day)}`;
  const isDisabled = (day) => Boolean(min) && keyFor(day) < min;

  return (
    <Popover
      className="w-full"
      width="w-[19rem]"
      disabled={disabled}
      label={value ? dtf.format(new Date(`${value}T00:00:00Z`)) : "…"}
      trigger={({ open }) => (
        <span
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          className={triggerControlClass({ invalid, open, disabled })}
        >
          <span className={cn("truncate", !value && "text-mist")}>
            {value ? dtf.format(new Date(`${value}T00:00:00Z`)) : "—"}
          </span>
          <Calendar className="size-4 shrink-0 text-muted" aria-hidden />
        </span>
      )}
    >
      {({ close }) => (
        <div className="p-3">
          <div className="flex items-center justify-between gap-2">
            {/* Logical icons so the arrows still point "back" and "forward"
                once the page mirrors under Arabic. */}
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-control text-muted transition hover:bg-paper hover:text-ink"
              onClick={() => step(-1)}
              aria-label="−1"
            >
              <ChevronLeft className="size-4 rtl:rotate-180" />
            </button>
            <p className="font-display text-sm font-bold capitalize">{monthLabel}</p>
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-control text-muted transition hover:bg-paper hover:text-ink"
              onClick={() => step(1)}
              aria-label="+1"
            >
              <ChevronRight className="size-4 rtl:rotate-180" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
            {weekdays.map((d) => (
              <span key={d} className="py-1 text-[11px] font-bold uppercase text-muted">
                {d.slice(0, 2)}
              </span>
            ))}
            {cells.map((day, i) =>
              day === null ? (
                <span key={`pad-${i}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  disabled={isDisabled(day)}
                  aria-pressed={isSelected(day)}
                  className={cn(
                    "h-9 rounded-control text-sm font-semibold tabular-nums transition",
                    "disabled:cursor-not-allowed disabled:opacity-30",
                    isSelected(day) ? "bg-primary text-primary-fg" : "text-ink hover:bg-paper",
                  )}
                  onClick={() => {
                    onChange(keyFor(day));
                    close();
                  }}
                >
                  {day}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
/** Quarter-hours: a show starts at :00, :15, :30 or :45, not at 21:07. */
const MINUTES = ["00", "15", "30", "45"];

/**
 * A time picker. `value`/`onChange` speak 24-hour "HH:mm", exactly as
 * <input type="time"> did — and with no AM/PM, which the native control
 * offered despite nobody in Morocco writing times that way.
 */
export function TimeField({ id, value, onChange, describedBy, invalid, required, disabled }) {
  const [hh = "", mm = ""] = (value ?? "").split(":");

  const set = (nextHh, nextMm) => onChange(`${nextHh || "00"}:${nextMm || "00"}`);

  return (
    <Popover
      className="w-full"
      width="w-44"
      disabled={disabled}
      label={value || "…"}
      trigger={({ open }) => (
        <span
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          aria-required={required || undefined}
          className={triggerControlClass({ invalid, open, disabled })}
        >
          <span className={cn("tabular-nums", !value && "text-mist")}>{value || "—"}</span>
          <Clock className="size-4 shrink-0 text-muted" aria-hidden />
        </span>
      )}
    >
      {() => (
        <div className="grid grid-cols-2 divide-x divide-line/10 rtl:divide-x-reverse">
          {/* Two short scroll columns rather than the native spinner's three
              (hour / minute / AM-PM), since 24-hour needs no meridiem. */}
          <ul className="scroll-thin max-h-56 overflow-y-auto p-1">
            {HOURS.map((h) => (
              <li key={h}>
                <button
                  type="button"
                  aria-pressed={h === hh}
                  className={cn(
                    "w-full rounded-control px-3 py-1.5 text-sm font-semibold tabular-nums transition",
                    h === hh ? "bg-primary text-primary-fg" : "text-ink hover:bg-paper",
                  )}
                  onClick={() => set(h, mm)}
                >
                  {h}
                </button>
              </li>
            ))}
          </ul>
          <ul className="scroll-thin max-h-56 overflow-y-auto p-1">
            {MINUTES.map((m) => (
              <li key={m}>
                <button
                  type="button"
                  aria-pressed={m === mm}
                  className={cn(
                    "w-full rounded-control px-3 py-1.5 text-sm font-semibold tabular-nums transition",
                    m === mm ? "bg-primary text-primary-fg" : "text-ink hover:bg-paper",
                  )}
                  onClick={() => set(hh, m)}
                >
                  {m}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Popover>
  );
}
