import { cn } from "../utils";

/** A panel. `pad` off when the content manages its own padding (a table, a
 * full-bleed image), which is why the old Card's fixed p-5 kept being undone. */
export function Card({ pad = true, raised = false, className, children, ...rest }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line/10 bg-card",
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
        <h1 className="font-display text-title font-extrabold">{title}</h1>
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
        <h2 className="font-display text-heading font-extrabold">{title}</h2>
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

/** A labelled figure. Used for both dashboard stats and buyer-facing counts. */
export function Stat({ label, value, sub, tone = "neutral", icon, className }) {
  const bars = {
    neutral: "bg-mist",
    primary: "bg-primary",
    accent: "bg-accent",
    success: "bg-success",
    danger: "bg-danger",
  };
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-line/10 bg-card p-5 shadow-card", className)}>
      <span className={cn("absolute inset-y-0 start-0 w-1", bars[tone])} aria-hidden />
      <div className="flex items-center gap-3">
        {icon ? (
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brume text-primary" aria-hidden>
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
          <p className="font-display text-heading font-extrabold tabular-nums">{value}</p>
        </div>
      </div>
      {sub ? <p className="mt-3 border-t border-line/10 pt-3 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}
