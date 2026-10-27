import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "../utils";

/**
 * The seat-hold countdown.
 *
 * This is the spine of the buying flow: the seat is claimed when the buyer
 * presses Book, before this form exists, and it is released when the clock
 * runs out. Previously it rendered as a flat Safran bar with the same visual
 * weight as the mock-mode notice beside it, on the one screen where time
 * pressure is real.
 *
 * It now escalates. Calm while there is plenty of time, warning under five
 * minutes, alarm under one — so a buyer who looks up from the form knows where
 * they stand without reading anything.
 */

const WARN_MS = 5 * 60 * 1000;
const ALARM_MS = 60 * 1000;

function parts(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    m: String(Math.floor(total / 60)).padStart(2, "0"),
    s: String(total % 60).padStart(2, "0"),
  };
}

export function Countdown({ until, label, expiredLabel, onExpire, className }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [until]);

  const target = until ? Date.parse(until) : null;
  const left = target === null ? null : Math.max(0, target - now);
  const expired = left === 0;

  // Fire once, on the transition — not on every render after it.
  useEffect(() => {
    if (expired && onExpire) onExpire();
  }, [expired, onExpire]);

  if (left === null) return null;

  const level = expired ? "expired" : left <= ALARM_MS ? "alarm" : left <= WARN_MS ? "warn" : "calm";

  const skins = {
    calm: "bg-brume text-primary",
    warn: "bg-warn-bg text-warn",
    alarm: "bg-danger-bg text-danger",
    expired: "bg-danger text-white",
  };

  const { m, s } = parts(left);

  return (
    <div
      className={cn("flex items-center gap-3 rounded-2xl px-4 py-3.5", skins[level], className)}
      // Polite, not assertive: a per-second assertive region would interrupt
      // a screen-reader user continuously while they fill the form.
      role="timer"
      aria-live="off"
    >
      <Clock className={cn("size-5 shrink-0", level === "alarm" && "animate-pulse")} aria-hidden />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold opacity-90">{expired ? expiredLabel : label}</p>
        {!expired ? (
          <p className="font-mono text-title font-extrabold leading-none tabular-nums">
            {m}:{s}
          </p>
        ) : null}
      </div>
    </div>
  );
}
