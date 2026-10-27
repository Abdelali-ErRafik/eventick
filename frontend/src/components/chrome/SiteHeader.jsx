import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, MapPin, Menu, Moon, Search, Sun, Ticket, User, X } from "lucide-react";
import { useAuth } from "../../AuthContext";
import { useCart } from "../../CartContext";
import { useCatalog } from "../../useCatalog";
import { LOCALES, LOCALE_LABELS, useI18n } from "../../i18n";
import { useTheme } from "../../ThemeContext";
import { Button, IconButton, Popover, PopoverItem } from "../../ui";
import { cn, CITIES } from "../../utils";

/**
 * The public site header.
 *
 * The previous one put **20 controls** in a single bar — burger, logo, city
 * picker, five nav links, search, three language buttons, theme, a "MAD"
 * badge, cart, create, avatar and sign-out — all at roughly equal weight, so
 * nothing read as primary and the row overflowed into a scrollbar on a laptop.
 * Its city and search dropdowns had no Escape and no outside-click dismissal.
 *
 * The rebuild keeps one primary action visible (sign in, or the account) and
 * moves the per-session settings — language, theme, sign out — behind the
 * account popover, which is where people look for them. The "MAD" badge is
 * gone: every price on the site is already labelled MAD, so it was a
 * permanent pixel cost for information shown at the point of use.
 */

const NAV = [
  { to: "/explorer", key: "explore" },
  { to: "/explorer?cat=festivals", key: "festivals" },
  { to: "/explorer?cat=humour", key: "concerts" },
  { to: "/explorer?cat=culture", key: "culture" },
  { to: "/pro", key: "pro" },
];

export function SiteHeader({ overlay = false }) {
  const { t, locale, setLocale } = useI18n();
  const { resolved, toggle } = useTheme();
  const { user, loading, logout } = useAuth();
  const { cart } = useCart();
  const { events } = useCatalog();
  const navigate = useNavigate();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The mobile sheet is modal, so it gets the same treatment as a dialog.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  // Transparent over a hero image until the page scrolls.
  const onImage = overlay && !scrolled;

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return events
      .filter((event) => `${event.titleFr} ${event.titleAr} ${event.city} ${event.venueFr}`.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [events, query]);

  const cartCount = cart?.lines?.reduce((sum, line) => sum + line.qty, 0) ?? 0;

  const goCity = (city, close) => {
    close?.();
    setMenuOpen(false);
    navigate(city ? `/explorer?ville=${encodeURIComponent(city)}` : "/explorer");
  };

  const submitSearch = (close) => {
    close?.();
    if (query.trim()) navigate(`/explorer?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors duration-200",
        onImage ? "border-transparent bg-encre/30 text-foam backdrop-blur-md" : "border-line/10 bg-card/95 text-ink backdrop-blur",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 md:px-8">
        <IconButton
          label={t("openMenu")}
          size="sm"
          tone={onImage ? "inverse" : "neutral"}
          className="lg:hidden"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="size-5" />
        </IconButton>

        <Link to="/" className="shrink-0 font-display text-xl font-extrabold tracking-tight">
          Eventick<span className={onImage ? "text-accent" : "text-primary"}>.ma</span>
        </Link>

        {/* City */}
        <Popover
          label={t("allMorocco")}
          className="hidden md:block"
          width="w-56"
          trigger={({ open }) => (
            <span
              className={cn(
                "inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition",
                onImage ? "bg-foam/15 hover:bg-foam/25" : "bg-paper hover:bg-brume",
              )}
            >
              <MapPin className={cn("size-4", onImage ? "text-accent" : "text-primary")} aria-hidden />
              {t("allMorocco")}
              <ChevronDown className={cn("size-4 transition", open && "rotate-180")} aria-hidden />
            </span>
          )}
        >
          {({ close }) => (
            <div className="max-h-80 overflow-y-auto py-1.5">
              <PopoverItem onClick={() => goCity("", close)}>{t("allMorocco")}</PopoverItem>
              {CITIES.map((city) => (
                <PopoverItem key={city} onClick={() => goCity(city, close)}>
                  {city}
                </PopoverItem>
              ))}
            </div>
          )}
        </Popover>

        <nav aria-label={t("explore")} className="ms-3 hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "rounded-full px-3 py-2 text-sm font-semibold transition",
                onImage ? "hover:bg-foam/15" : "hover:bg-paper",
              )}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-1.5">
          {/* Search */}
          <Popover
            label={t("searchPh")}
            align="end"
            width="w-80"
            trigger={
              <span
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-full transition",
                  onImage ? "bg-foam/15 hover:bg-foam/25" : "bg-paper hover:bg-brume",
                )}
              >
                <Search className="size-4" aria-hidden />
              </span>
            }
          >
            {({ close }) => (
              <div className="p-3">
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && submitSearch(close)}
                  placeholder={t("searchPh")}
                  aria-label={t("searchPh")}
                  className="h-11 w-full rounded-xl border border-line/15 bg-card px-4 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/20"
                />
                {results.length > 0 ? (
                  <ul className="mt-2 grid gap-0.5">
                    {results.map((event) => (
                      <li key={event.slug}>
                        <Link
                          to={`/evenements/${event.slug}`}
                          onClick={close}
                          className="block rounded-lg px-3 py-2 transition hover:bg-paper"
                        >
                          <span className="block truncate text-sm font-semibold">
                            {locale === "ar" ? event.titleAr : event.titleFr}
                          </span>
                          <span className="block text-xs text-muted">{event.city}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </Popover>

          {/* Cart */}
          <Link
            to="/paiement"
            aria-label={cartCount > 0 ? `${t("cart")} (${cartCount})` : t("cart")}
            className={cn(
              "relative inline-flex size-10 items-center justify-center rounded-full transition",
              onImage ? "bg-foam/15 hover:bg-foam/25" : "bg-paper hover:bg-brume",
            )}
          >
            <Ticket className="size-4" aria-hidden />
            {cartCount > 0 ? (
              <span className="absolute -end-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-extrabold text-accent-fg tabular-nums">
                {cartCount}
              </span>
            ) : null}
          </Link>

          <Button
            variant={onImage ? "inverse" : "secondary"}
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => navigate("/organiser")}
          >
            {t("create")}
          </Button>

          {/* Account — holds the session settings that used to crowd the bar. */}
          {!loading && user ? (
            <Popover
              label={t("account")}
              align="end"
              width="w-60"
              trigger={({ open }) => (
                <span className="flex items-center gap-1.5 rounded-full p-0.5 transition hover:bg-foam/10">
                  <span
                    className="inline-flex size-9 items-center justify-center rounded-full bg-primary font-display text-sm font-extrabold text-primary-fg"
                    aria-hidden
                  >
                    {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <ChevronDown className={cn("size-4 transition", open && "rotate-180")} aria-hidden />
                </span>
              )}
            >
              {({ close }) => (
                <>
                  <div className="border-b border-line/10 px-4 py-3">
                    <p className="truncate text-sm font-bold">{user.name}</p>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                  </div>
                  <div className="py-1.5">
                    <PopoverItem as={Link} to="/billets" onClick={close}>
                      <Ticket className="size-4 shrink-0 text-muted" aria-hidden />
                      {t("account")}
                    </PopoverItem>
                    <PopoverItem onClick={toggle}>
                      {resolved === "dark" ? (
                        <Sun className="size-4 shrink-0 text-muted" aria-hidden />
                      ) : (
                        <Moon className="size-4 shrink-0 text-muted" aria-hidden />
                      )}
                      {resolved === "dark" ? t("themeLight") : t("themeDark")}
                    </PopoverItem>
                  </div>
                  <LocaleRow locale={locale} setLocale={setLocale} t={t} />
                  <div className="border-t border-line/10">
                    <PopoverItem
                      className="text-danger hover:bg-danger-bg"
                      onClick={() => {
                        close();
                        logout();
                        navigate("/");
                      }}
                    >
                      <LogOut className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
                      {t("signOut")}
                    </PopoverItem>
                  </div>
                </>
              )}
            </Popover>
          ) : (
            <>
              {/* Signed out: the settings still need a home. */}
              <Popover
                label={t("themeDark")}
                align="end"
                width="w-52"
                className="hidden sm:block"
                trigger={
                  <span
                    className={cn(
                      "inline-flex size-10 items-center justify-center rounded-full transition",
                      onImage ? "bg-foam/15 hover:bg-foam/25" : "bg-paper hover:bg-brume",
                    )}
                  >
                    {resolved === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
                  </span>
                }
              >
                <>
                  <div className="py-1.5">
                    <PopoverItem onClick={toggle}>
                      {resolved === "dark" ? (
                        <Sun className="size-4 shrink-0 text-muted" aria-hidden />
                      ) : (
                        <Moon className="size-4 shrink-0 text-muted" aria-hidden />
                      )}
                      {resolved === "dark" ? t("themeLight") : t("themeDark")}
                    </PopoverItem>
                  </div>
                  <LocaleRow locale={locale} setLocale={setLocale} t={t} />
                </>
              </Popover>

              <Button size="sm" onClick={() => navigate("/login")} icon={<User className="size-4 sm:hidden" />}>
                <span className="hidden sm:inline">{t("signIn")}</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Mobile sheet */}
      {menuOpen ? (
        <>
          <div className="fixed inset-0 z-[55] bg-encre/50 backdrop-blur-[2px] lg:hidden" onClick={() => setMenuOpen(false)} role="presentation" />
          <div
            className="fixed inset-y-0 start-0 z-[60] flex w-[min(20rem,86vw)] flex-col bg-card text-ink lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={t("openMenu")}
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line/10 px-4">
              <span className="font-display text-lg font-extrabold">
                Eventick<span className="text-primary">.ma</span>
              </span>
              <IconButton label={t("close")} size="sm" onClick={() => setMenuOpen(false)}>
                <X className="size-5" />
              </IconButton>
            </div>

            <nav aria-label={t("explore")} className="min-h-0 flex-1 overflow-y-auto p-3">
              <ul className="grid gap-0.5">
                {NAV.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-xl px-3 py-3 text-[15px] font-semibold transition hover:bg-paper"
                    >
                      {t(item.key)}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    to="/billets"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-xl px-3 py-3 text-[15px] font-semibold transition hover:bg-paper"
                  >
                    {t("account")}
                  </Link>
                </li>
              </ul>

              <p className="mt-5 px-3 pb-2 text-[11px] font-extrabold uppercase tracking-wide text-muted">{t("allMorocco")}</p>
              <div className="flex flex-wrap gap-2 px-1">
                <button
                  type="button"
                  onClick={() => goCity("")}
                  className="rounded-full bg-paper px-3 py-2 text-sm font-semibold transition hover:bg-brume"
                >
                  {t("allMorocco")}
                </button>
                {CITIES.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => goCity(city)}
                    className="rounded-full bg-paper px-3 py-2 text-sm font-semibold transition hover:bg-brume"
                  >
                    {city}
                  </button>
                ))}
              </div>
            </nav>

            <div className="shrink-0 border-t border-line/10 p-3">
              <div className="flex items-center gap-2">
                <IconButton label={resolved === "dark" ? t("themeLight") : t("themeDark")} onClick={toggle}>
                  {resolved === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
                </IconButton>
                <div className="flex flex-1 gap-1.5" role="group" aria-label="locale">
                  {LOCALES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setLocale(code)}
                      aria-pressed={locale === code}
                      className={cn(
                        "h-10 flex-1 rounded-xl text-xs font-extrabold transition",
                        locale === code ? "bg-primary text-primary-fg" : "bg-paper text-muted",
                      )}
                    >
                      {t(LOCALE_LABELS[code])}
                    </button>
                  ))}
                </div>
              </div>
              {!loading && user ? (
                <Button
                  variant="secondary"
                  full
                  className="mt-3"
                  icon={<LogOut className="size-4 rtl:rotate-180" />}
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                    navigate("/");
                  }}
                >
                  {t("signOut")}
                </Button>
              ) : (
                <Button
                  full
                  className="mt-3"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate("/login");
                  }}
                >
                  {t("signIn")}
                </Button>
              )}
            </div>
          </div>
        </>
      ) : null}
    </header>
  );
}

function LocaleRow({ locale, setLocale, t }) {
  return (
    <div className="border-t border-line/10 px-4 py-3">
      <div className="flex gap-1.5" role="group" aria-label="locale">
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            aria-pressed={locale === code}
            className={cn(
              "h-9 flex-1 rounded-lg text-xs font-extrabold transition",
              locale === code ? "bg-primary text-primary-fg" : "bg-paper text-muted hover:text-ink",
            )}
          >
            {t(LOCALE_LABELS[code])}
          </button>
        ))}
      </div>
    </div>
  );
}
