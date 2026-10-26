// Shared dashboard primitives. Structure and density follow the multiseller
// admin, rendered in Eventick's charte colours so dark mode keeps working.
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Search, X } from "lucide-react";
import { cn } from "../../utils";

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

export function Card({ className, children }) {
  return <div className={cn("rounded-xl border border-line/10 bg-card p-5 shadow-card", className)}>{children}</div>;
}

export function StatCard({ icon, label, value, sub, trend, accent, info }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line/10 bg-card p-5 shadow-card">
      <span className={cn("absolute inset-y-0 start-0 w-1", accent ? "bg-safran" : "bg-lagon")} aria-hidden />
      <div className="flex items-center gap-3">
        {icon ? (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brume text-lagon-deep" aria-hidden>
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
                trend.dir === "up" && "bg-lagon/12 text-lagon-deep",
                trend.dir === "down" && "bg-corail/12 text-corail",
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

export function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={text}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex size-4 items-center justify-center rounded-full text-muted hover:text-lagon"
      >
        <Info className="size-3.5" />
      </button>
      {open ? (
        <span className="absolute bottom-full start-1/2 z-50 mb-1.5 w-56 -translate-x-1/2 rounded-lg bg-encre px-3 py-2 text-xs font-medium normal-case tracking-normal text-foam shadow-pop rtl:translate-x-1/2">
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function Badge({ tone = "gray", children }) {
  const tones = {
    green: "bg-lagon/12 text-lagon-deep",
    amber: "bg-safran/20 text-safran-deep",
    red: "bg-corail/12 text-corail",
    blue: "bg-brume text-lagon-deep",
    gray: "bg-paper text-muted",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", tones[tone])}>{children}</span>;
}

export function Btn({ variant = "primary", size = "md", className, type = "button", ...props }) {
  const variants = {
    primary: "bg-safran text-encre hover:bg-safran-deep",
    secondary: "border border-line/20 bg-card text-ink hover:bg-paper",
    ghost: "text-lagon hover:bg-brume",
    danger: "bg-corail text-white hover:brightness-110",
  };
  const sizes = { sm: "h-9 px-3 text-[13px]", md: "h-11 px-4 text-sm" };
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function IconBtn({ tone = "default", label, className, ...props }) {
  const tones = {
    default: "hover:border-lagon hover:bg-brume hover:text-lagon-deep",
    danger: "hover:border-corail hover:bg-corail/10 hover:text-corail",
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg border border-line/15 bg-card text-muted transition hover:-translate-y-px active:scale-95 disabled:opacity-40",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Underline tabs for sub-views inside one section. */
export function Tabs({ value, onChange, options }) {
  return (
    <div className="mb-5 flex flex-wrap gap-1 border-b border-line/10" role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "-mb-px inline-flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-bold transition",
            value === opt.value ? "border-lagon text-lagon-deep" : "border-transparent text-muted hover:bg-paper hover:text-ink",
          )}
        >
          {opt.icon}
          {opt.label}
          {opt.count > 0 ? (
            <span className={cn("rounded-full px-1.5 text-[11px] font-extrabold", value === opt.value ? "bg-lagon text-white" : "bg-line/15 text-muted")}>
              {opt.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, onSubmit }) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
      className="relative flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-line/20 bg-card px-4 focus-within:border-lagon focus-within:ring-[3px] focus-within:ring-lagon/15 sm:max-w-sm"
    >
      <Search className="size-4 shrink-0 text-lagon" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none"
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} aria-label="clear" className="shrink-0 rounded text-muted hover:text-ink">
          <X className="size-4" />
        </button>
      ) : null}
    </form>
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
              className="h-11 rounded-xl border border-line/20 bg-card px-3 text-sm outline-none focus:border-lagon focus:ring-[3px] focus:ring-lagon/15"
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
            className="h-11 rounded-xl border border-dashed border-line/30 px-3.5 text-[13px] font-bold text-muted transition hover:border-solid hover:border-corail hover:text-corail"
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

export function SortTh({ field, sort, dir, onSort, children }) {
  const active = sort === field;
  return (
    <Th>
      <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 font-inherit hover:text-lagon-deep">
        {children}
        {active ? dir === "asc" ? <ChevronLeft className="size-3.5 rotate-90 text-lagon" /> : <ChevronRight className="size-3.5 rotate-90 text-lagon" /> : null}
      </button>
    </Th>
  );
}

/** Initial-avatar + truncating name, for person columns. */
export function PersonCell({ name, sub }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brume text-[13px] font-extrabold text-lagon-deep" aria-hidden>
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
      {unit ? <span className="rounded-full bg-brume px-1.5 text-[11px] font-bold text-lagon-deep">{unit}</span> : null}
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
  const colors = { ok: "bg-lagon", low: "bg-safran", out: "bg-corail/40" };
  const text = { ok: "text-lagon-deep", low: "text-safran-deep", out: "text-corail" };
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

export function EmptyState({ icon = "📭", title, text, action }) {
  return (
    <div className="px-4 py-11 text-center text-muted">
      <div className="mb-2 text-5xl" aria-hidden>
        {icon}
      </div>
      <strong className="mb-1 block text-base text-ink">{title}</strong>
      {text ? <div className="text-sm">{text}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cn("animate-pulse rounded-lg bg-line/10", className)} />;
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
            className="h-9 rounded-lg border border-line/20 bg-card px-2 text-sm outline-none focus:border-lagon"
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

export function Modal({ open, onClose, title, sub, icon, children, footer, wide }) {
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    boxRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-encre/45 p-5 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[calc(100vh-40px)] w-full flex-col overflow-hidden rounded-2xl bg-card shadow-modal outline-none",
          wide ? "max-w-[620px]" : "max-w-[440px]",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/10 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon ? <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brume text-lagon-deep">{icon}</span> : null}
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg font-extrabold tracking-tight">{title}</h2>
              {sub ? <p className="mt-0.5 truncate text-xs text-muted">{sub}</p> : null}
            </div>
          </div>
          <IconBtn tone="danger" label="close" onClick={onClose}>
            <X className="size-4" />
          </IconBtn>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <div className="flex shrink-0 justify-end gap-2.5 border-t border-line/10 bg-paper px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>
  );
}
