// Dashboard-specific primitives.
//
// The generic ones (Button, Modal, Badge, Card, EmptyState, Skeleton) now come
// from src/ui and are re-exported here under the names the pro screens already
// import. Keeping a second copy was how the buyer side and the dashboard ended
// up with different buttons and four incompatible modals.
//
// What stays below is genuinely dashboard-only: the data table, the stat card,
// and the table cell renderers.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../utils";
import { Badge, Button, Card, EmptyState, IconButton, Modal, Skeleton } from "../../ui";

export { Badge, Card, EmptyState, Modal, Skeleton };
/** Alias: the pro screens call it Btn. */
export const Btn = Button;
/** Alias: the pro screens call it IconBtn. `label` is required by IconButton,
 * which is what makes these announce themselves to a screen reader. */
export const IconBtn = IconButton;

export function PageHead({ title, sub, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {sub ? <p className="mt-0.5 text-sm text-muted">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="mb-4 mt-8 flex items-center justify-between gap-3">
      <h2 className="font-display text-[22px] font-extrabold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}


export function StatCard({ icon, label, value, sub, trend, accent, info }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line/10 bg-card p-5 shadow-card">
      <span className={cn("absolute inset-y-0 start-0 w-1", accent ? "bg-accent" : "bg-primary")} aria-hidden />
      <div className="flex items-center gap-3">
        {icon ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brume text-primary" aria-hidden>
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted">
            {label}
            {info ? <InfoTip text={info} /> : null}
          </p>
          <p className="font-display text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
        </div>
      </div>
      {sub || trend ? (
        <div className="mt-3 flex items-center justify-between gap-2.5 border-t border-line/10 pt-3">
          {sub ? <span className="truncate text-xs text-muted">{sub}</span> : <span />}
          {trend ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-extrabold",
                trend.dir === "up" && "bg-primary/12 text-primary",
                trend.dir === "down" && "bg-danger/12 text-danger",
                trend.dir === "flat" && "bg-paper text-muted",
              )}
            >
              {trend.text}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}







/** Filter toolbar: search + labelled controls + active-count reset. */
export function FilterBar({ search, controls = [], activeCount = 0, onReset, resetLabel, actions }) {
  return (
    <div className="mb-4 rounded-xl border border-line/10 bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-end gap-2.5">
        {search ? <SearchInput {...search} /> : null}
        {controls.map((control) => (
          <label key={control.key} className="flex flex-col gap-1.5">
            <span className="ps-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">{control.label}</span>
            <select
              value={control.value}
              onChange={control.onChange}
              style={control.style}
              className="h-11 rounded-xl border border-line/20 bg-card px-3 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
            >
              {control.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {activeCount > 0 && onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="h-11 rounded-xl border border-dashed border-line/30 px-3.5 text-[13px] font-bold text-muted transition hover:border-solid hover:border-danger hover:text-danger"
          >
            {resetLabel} ({activeCount})
          </button>
        ) : null}
        {actions ? <div className="ms-auto flex items-end gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function DataTable({ minWidth = 760, children }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line/10 bg-card shadow-card">
      <table className="w-full border-collapse" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className }) {
  return (
    <th
      scope="col"
      className={cn("border-b border-line/10 bg-paper px-3.5 py-3 text-center text-xs font-bold uppercase tracking-wide text-muted", className)}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }) {
  return <td className={cn("border-b border-line/10 px-3 py-3 align-middle", className)}>{children}</td>;
}


/** Initial-avatar + truncating name, for person columns. */
export function PersonCell({ name, sub }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brume text-[13px] font-extrabold text-primary" aria-hidden>
        {(name || "?").slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-semibold" title={name}>
          {name}
        </span>
        {sub ? (
          <span className="block truncate text-xs text-muted" title={sub}>
            {sub}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** Thumb + title over muted subline, for event columns. */
export function EntityCell({ image, title, sub }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {image ? (
        <img src={image} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="size-9 shrink-0 rounded-lg bg-brume" aria-hidden />
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold" title={title}>
          {title}
        </span>
        {sub ? (
          <span className="block truncate text-xs text-muted" title={sub}>
            {sub}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function MoneyCell({ children, unit }) {
  return (
    <span className="inline-flex flex-col items-start gap-0.5 leading-tight">
      <span className="text-[15px] font-extrabold tracking-tight tabular-nums">{children}</span>
      {unit ? <span className="rounded-full bg-brume px-1.5 text-[11px] font-bold text-primary">{unit}</span> : null}
    </span>
  );
}

export function CountChip({ icon, children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line/15 bg-paper px-2.5 py-0.5 text-xs font-bold text-muted">
      {icon}
      {children}
    </span>
  );
}

/** Count over a colour-coded fill bar, for remaining-stock columns. */
export function StockCell({ left, total }) {
  const ratio = total > 0 ? left / total : 0;
  const tone = ratio <= 0 ? "out" : ratio < 0.2 ? "low" : "ok";
  const colors = { ok: "bg-primary", low: "bg-accent", out: "bg-danger/40" };
  const text = { ok: "text-primary", low: "text-accent", out: "text-danger" };
  return (
    <span className="inline-flex min-w-[68px] flex-col gap-1">
      <span className="leading-none">
        <span className={cn("text-sm font-extrabold tabular-nums", text[tone])}>{left}</span>
        <span className="text-[11px] font-semibold text-muted">/{total}</span>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-line/10">
        <span className={cn("block h-full rounded-full transition-[width]", colors[tone])} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
    </span>
  );
}



export function StatSkeletons({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-line/10 bg-card p-5 shadow-card">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="mt-2.5 h-7 w-28" />
        </div>
      ))}
    </>
  );
}

export function Pager({ page, pages, onPage, limit, onLimit, labels }) {
  if (pages <= 1 && !onLimit) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      {onLimit ? (
        <label className="flex items-center gap-2 text-xs text-muted">
          {labels.rows}
          <select
            value={limit}
            onChange={(e) => onLimit(Number(e.target.value))}
            className="h-9 rounded-lg border border-line/20 bg-card px-2 text-sm outline-none focus:border-primary"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span />
      )}
      {pages > 1 ? (
        <div className="ms-auto flex items-center gap-4">
          <Btn variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>
            <ChevronLeft className="size-4 rtl:rotate-180" />
            {labels.prev}
          </Btn>
          <span className="min-w-[90px] text-center text-xs text-muted">
            {page} / {pages}
          </span>
          <Btn variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(Math.min(pages, page + 1))}>
            {labels.next}
            <ChevronRight className="size-4 rtl:rotate-180" />
          </Btn>
        </div>
      ) : null}
    </div>
  );
}

