import { Ban, CheckCircle2, CircleSlash, HelpCircle, RotateCcw, ScanLine, ShieldAlert } from "lucide-react";
import { cn } from "../utils";

/**
 * The gate's admit/refuse panel.
 *
 * This is read standing up, one-handed, at a venue door, often in the dark,
 * with a queue waiting. The old panel rendered the verdict at body size inside
 * a `py-4` strip tinted `bg-primary/25` or `bg-danger/25` — and it mapped six
 * distinct outcomes onto two colours, so "already used" looked exactly like
 * "cancelled" and staff could not tell a double-entry attempt from a refund.
 *
 * So: full-bleed, one enormous word, a distinct icon per outcome, and the
 * reason underneath. The icon and the word do the work — colour only
 * reinforces, because colour alone fails in sunlight and for colour-blind
 * staff.
 */

const OUTCOMES = {
  ok: {
    skin: "bg-success text-success-fg",
    icon: CheckCircle2,
  },
  used: {
    // Amber, not red: the ticket was genuine, it has simply been scanned
    // already. Staff need to treat that differently from a forgery.
    skin: "bg-warn text-warn-fg",
    icon: RotateCcw,
  },
  cancelled: {
    skin: "bg-danger text-danger-fg",
    icon: Ban,
  },
  moved: {
    skin: "bg-info text-info-fg",
    icon: CircleSlash,
  },
  invalid: {
    skin: "bg-danger text-danger-fg",
    icon: ShieldAlert,
  },
  missing: {
    skin: "bg-encre text-foam",
    icon: HelpCircle,
  },
};

export function Verdict({ code, headline, detail, holder, ticketRef, idleLabel, className }) {
  const idle = !code;
  const outcome = OUTCOMES[code] ?? OUTCOMES.missing;
  const Icon = idle ? ScanLine : outcome.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-card px-5 py-6 sm:px-6 sm:py-7",
        idle ? "bg-sunken text-muted" : outcome.skin,
        className,
      )}
      // Assertive: a wrong verdict going unnoticed lets the wrong person in,
      // so this one does interrupt.
      role="status"
      aria-live="assertive"
    >
      <Icon className="size-10 shrink-0 sm:size-12" aria-hidden />
      <div className="min-w-0">
        <p className="font-display text-display font-extrabold uppercase leading-none tracking-tight">
          {idle ? idleLabel : headline}
        </p>
        {!idle && detail ? <p className="mt-1.5 text-sm font-semibold opacity-95">{detail}</p> : null}
        {!idle && (holder || ticketRef) ? (
          <p className="mt-1 truncate font-mono text-xs opacity-80">
            {holder ? `${holder} · ` : ""}
            {ticketRef}
          </p>
        ) : null}
      </div>
    </div>
  );
}
