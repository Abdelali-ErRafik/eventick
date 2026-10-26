// Dashboard scaffold: persistent grouped sidebar (collapsible to a rail that
// expands on hover) + sticky blurred topbar, mirroring the multiseller admin.
import { useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ChevronLeft, ChevronRight, ExternalLink, LogOut, Menu, Moon, Search, Sun, X } from "lucide-react";
import { useAuth } from "../../AuthContext";
import { useI18n } from "../../i18n";
import { useTheme } from "../../ThemeContext";
import { cn } from "../../utils";
import { text } from "./copy";

const STORAGE_KEY = "eventick-dash-collapsed";

export default function DashboardShell({ sections, children }) {
  const { locale, setLocale } = useI18n();
  const t = text[locale];
  const { user, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // storage blocked — stay expanded
    }
  }, []);

  const setPinned = (value) => {
    setCollapsed(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const rail = collapsed && !hovering;

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const visible = needle ? sections.filter((s) => s.label.toLowerCase().includes(needle)) : sections;
    const out = [];
    for (const section of visible) {
      let bucket = out.find((g) => g.name === section.group);
      if (!bucket) {
        bucket = { name: section.group, items: [] };
        out.push(bucket);
      }
      bucket.items.push(section);
    }
    return out;
  }, [sections, q]);

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      {open ? <div className="fixed inset-0 z-[55] bg-encre/40 lg:hidden" onClick={() => setOpen(false)} role="presentation" /> : null}

      <aside
        onMouseEnter={() => collapsed && setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={cn(
          "fixed inset-y-0 z-[60] flex shrink-0 flex-col border-e border-line/10 bg-card transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          rail ? "w-[74px]" : "w-64",
          collapsed && hovering && "shadow-pop",
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full lg:rtl:translate-x-0",
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <Link to="/" className={cn("font-display text-lg font-extrabold tracking-tight", rail && "sr-only")}>
            Eventick<span className="text-safran">.ma</span>
          </Link>
          {rail ? <span className="mx-auto font-display text-lg font-extrabold text-safran">E</span> : null}
          <button type="button" className="rounded-lg p-1 text-muted hover:text-ink lg:hidden" onClick={() => setOpen(false)} aria-label={t.close}>
            <X className="size-5" />
          </button>
        </div>

        <div className={cn("flex items-center justify-between gap-2 px-3 pb-3", rail && "justify-center")}>
          {!rail ? <span className="rounded-full bg-brume px-3 py-1.5 text-[11.5px] font-extrabold text-lagon-deep">{t.brand}</span> : null}
          <button
            type="button"
            onClick={() => setPinned(!collapsed)}
            aria-label={collapsed ? t.expand : t.collapse}
            title={collapsed ? t.expand : t.collapse}
            className="hidden size-8 items-center justify-center rounded-lg text-muted hover:bg-paper hover:text-ink lg:inline-flex"
          >
            {collapsed ? <ChevronRight className="size-4 rtl:rotate-180" /> : <ChevronLeft className="size-4 rtl:rotate-180" />}
          </button>
        </div>

        {!rail ? (
          <div className="relative px-3 pb-3">
            <Search className="pointer-events-none absolute start-6 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.sidebarSearch}
              className="h-10 w-full rounded-xl border border-line/15 bg-paper ps-9 pe-8 text-sm outline-none focus:border-lagon focus:ring-[3px] focus:ring-lagon/15"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label={t.close}
                className="absolute end-6 top-1/2 -translate-y-1/2 rounded text-muted hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group.name} className="mb-1">
              {!rail ? (
                <p className="px-3 pb-1 pt-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-muted">{group.name}</p>
              ) : (
                <div className="my-2 border-t border-line/10" />
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  title={rail ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      "relative mb-0.5 flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-sm font-semibold transition",
                      rail && "justify-center px-0",
                      isActive ? "bg-lagon text-white" : "text-muted hover:bg-brume hover:text-lagon-deep",
                    )
                  }
                >
                  <span className="shrink-0" aria-hidden>
                    {item.icon}
                  </span>
                  {!rail ? <span className="truncate">{item.label}</span> : null}
                  {item.badge > 0 ? (
                    rail ? (
                      <span className="absolute end-2 top-2 size-2 rounded-full bg-safran" aria-hidden />
                    ) : (
                      <span className="ms-auto min-w-5 rounded-full bg-safran px-1.5 text-center text-[11px] font-extrabold text-encre">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )
                  ) : null}
                </NavLink>
              ))}
            </div>
          ))}
          {groups.length === 0 ? <p className="px-3 py-4 text-sm text-muted">{t.noNavResults}</p> : null}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex min-h-16 items-center gap-2 border-b border-line/10 bg-card/90 px-4 py-3 backdrop-blur-md md:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t.openMenu}
            className="inline-flex size-9 items-center justify-center rounded-xl border border-transparent text-muted hover:border-lagon hover:bg-brume hover:text-lagon-deep lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <Link
            to="/"
            title={t.market}
            aria-label={t.market}
            className="inline-flex size-9 items-center justify-center rounded-xl border border-transparent text-muted transition hover:border-lagon hover:bg-brume hover:text-lagon-deep active:scale-95"
          >
            <ExternalLink className="size-[18px]" />
          </Link>
          <div className="flex items-center rounded-full bg-paper p-1 text-xs font-bold">
            {["fr", "ar"].map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLocale(code)}
                className={cn("rounded-full px-2 py-1", locale === code && "bg-card text-encre shadow-card")}
              >
                {code === "fr" ? "FR" : "عربي"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={resolved === "dark" ? "light" : "dark"}
            className="inline-flex size-9 items-center justify-center rounded-xl border border-transparent text-muted transition hover:border-lagon hover:bg-brume hover:text-lagon-deep active:scale-95"
          >
            {resolved === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>
          <span className="mx-1 h-6 w-px bg-line/15" aria-hidden />
          <div className="flex items-center gap-2.5">
            <span className="hidden text-end sm:block">
              <span className="block max-w-[11rem] truncate text-[13px] font-bold leading-tight">{user?.name}</span>
              <span className="block text-[11px] text-muted">{user?.role}</span>
            </span>
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-brume text-sm font-extrabold text-lagon-deep" aria-hidden>
              {(user?.name ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <button
              type="button"
              onClick={logout}
              aria-label={t.signOut}
              title={t.signOut}
              className="inline-flex size-9 items-center justify-center rounded-xl border border-transparent text-muted transition hover:border-corail hover:bg-corail/10 hover:text-corail active:scale-95"
            >
              <LogOut className="size-[18px] rtl:rotate-180" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pb-14 pt-6 md:px-7">
          <div className="mx-auto max-w-[1180px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
