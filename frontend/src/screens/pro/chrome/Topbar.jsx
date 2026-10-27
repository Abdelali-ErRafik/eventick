import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ExternalLink, LogOut, Menu, Moon, Sun } from "lucide-react";
import { IconButton } from "../../../ui";
import { cn } from "../../../utils";

/**
 * Dashboard topbar.
 *
 * The previous header was a flat row of five bare icon buttons plus a language
 * segmented control and a name — everything at equal weight, so nothing read
 * as more or less important, and the sign-out button sat one pixel from the
 * avatar with nothing to stop a mis-tap.
 *
 * Now the per-session controls (theme, language, sign out) live behind the
 * account button, which is where people look for them, and the bar itself
 * carries the page title so there is a fixed place to orient from while
 * scrolling a long table.
 */

export function Topbar({ title, onOpenNav, user, onLogout, theme, onToggleTheme, locales, locale, onSetLocale, localeShort, labels }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      if (buttonRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [menuOpen]);

  const initial = (user?.name ?? "?").trim().slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-line/10 bg-card/85 px-4 backdrop-blur-md md:px-6">
      <IconButton label={labels.openMenu} size="sm" className="lg:hidden" onClick={onOpenNav}>
        <Menu className="size-5" />
      </IconButton>

      {/* A fixed anchor while scrolling a long table. */}
      <p className="min-w-0 flex-1 truncate font-display text-subhead font-extrabold">{title}</p>

      <Link
        to="/"
        aria-label={labels.market}
        title={labels.market}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-muted transition hover:bg-brume hover:text-primary active:scale-95"
      >
        <ExternalLink className="size-[18px]" aria-hidden />
      </Link>

      <span className="h-6 w-px shrink-0 bg-line/15" aria-hidden />

      {/* Account */}
      <div className="relative shrink-0">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={labels.userMenu}
          className="flex items-center gap-2 rounded-control py-1 ps-1 pe-1.5 transition hover:bg-sunken active:scale-[0.98]"
        >
          {/* A squared avatar tile, not a circle — part of the shift away
              from the old soft/round surface language. */}
          <span
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-control bg-primary text-[13px] font-bold text-primary-fg"
            aria-hidden
          >
            {initial}
          </span>
          <span className="hidden min-w-0 text-start sm:block">
            <span className="block max-w-[10rem] truncate text-[13px] font-bold leading-tight">{user?.name}</span>
            <span className="block text-[11px] text-muted">{user?.role}</span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted transition", menuOpen && "rotate-180")} aria-hidden />
        </button>

        {menuOpen ? (
          <div
            ref={menuRef}
            role="menu"
            aria-label={labels.userMenu}
            className="absolute end-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-panel border border-line/10 bg-card shadow-modal"
          >
            <div className="border-b border-line/10 px-4 py-3">
              <p className="truncate text-sm font-bold">{user?.name}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>

            {/* Theme */}
            <button
              type="button"
              role="menuitem"
              onClick={onToggleTheme}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-start text-sm font-semibold text-ink transition hover:bg-sunken"
            >
              {theme === "dark" ? <Sun className="size-4 shrink-0 text-muted" aria-hidden /> : <Moon className="size-4 shrink-0 text-muted" aria-hidden />}
              <span>{theme === "dark" ? labels.themeLight : labels.themeDark}</span>
            </button>

            {/* Language */}
            <div className="border-t border-line/10 px-4 py-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">{labels.langLabel}</p>
              <div className="flex gap-1.5" role="group" aria-label={labels.langLabel}>
                {locales.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => onSetLocale(code)}
                    aria-pressed={locale === code}
                    className={cn(
                      "h-9 flex-1 rounded-control text-xs font-bold transition",
                      locale === code ? "bg-action text-action-fg" : "bg-sunken text-muted hover:text-ink",
                    )}
                  >
                    {localeShort[code]}
                  </button>
                ))}
              </div>
            </div>

            {/* Sign out — separated, and the only danger-toned row. */}
            <div className="border-t border-line/10">
              <button
                type="button"
                role="menuitem"
                onClick={onLogout}
                className="flex w-full items-center gap-3 px-4 py-3 text-start text-sm font-semibold text-danger transition hover:bg-danger-bg"
              >
                <LogOut className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
                <span>{labels.signOut}</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
