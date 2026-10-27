import { cn } from "../utils";

/**
 * A panel.
 *
 * Shape language v2: a tighter `--radius-card` (1rem, was 1.5rem/rounded-2xl)
 * and a crisper, less diffuse shadow (see --shadow-card in styles.css) — part
 * of moving away from the old soft-pill, soft-glow language toward something
 * more geometric. `pad` off when the content manages its own padding (a
 * table, a full-bleed image).
 */
export function Card({ pad = true, raised = false, className, children, ...rest }) {
  return (
    <div
      className={cn(
        "rounded-card border border-line/10 bg-card",
        raised ? "shadow-pop" : "shadow-card",
        pad && "p-5",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** A page's title block. Actions sit end-aligned and wrap under on narrow
 * screens rather than squeezing the title. */
export function PageHeader({ title, sub, actions, className }) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-title font-bold">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function SectionHeader({ title, sub, action, className }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="font-display text-heading font-bold">{title}</h2>
        {sub ? <p className="mt-0.5 text-sm text-muted">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** The page gutter. One place that decides max width and side padding, so
 * screens stop each choosing their own and failing to line up. */
export function Container({ size = "wide", className, children }) {
  const sizes = {
    narrow: "max-w-2xl",
    form: "max-w-3xl",
    dash: "max-w-[1180px]",
    wide: "max-w-7xl",
  };
  return <div className={cn("mx-auto w-full px-4 md:px-8", sizes[size], className)}>{children}</div>;
}

/**
 * A labelled figure.
 *
 * Shape v2: dropped the left accent bar (every stat tile had one, so it
 * stopped meaning anything) in favour of a small square icon tile with a
 * flat fill — closer to how Linear/Vercel-style dashboards mark a metric's
 * category without a coloured edge competing with six others on the same
 * screen. `tone` now colours the icon tile itself.
 */
export function Stat({ label, value, sub, tone = "neutral", icon, className }) {
  const tiles = {
    neutral: "bg-sunken text-muted",
    primary: "bg-primary text-primary-fg",
    accent: "bg-accent text-accent-fg",
    success: "bg-success-bg text-success",
    danger: "bg-danger-bg text-danger",
  };
  return (
    <div className={cn("rounded-card border border-line/10 bg-card p-5 shadow-card", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{label}</p>
          <p className="mt-1.5 font-display text-heading font-bold tabular-nums">{value}</p>
        </div>
        {icon ? (
          <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-control", tiles[tone])} aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      {sub ? <p className="mt-3 border-t border-line/10 pt-3 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}
