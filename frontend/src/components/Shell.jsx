import { Link, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  CircleUserRound,
  Headphones,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Moon,
  QrCode,
  Search,
  ShieldCheck,
  Sun,
  Ticket,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../AuthContext";
import { useCart } from "../CartContext";
import { useCatalog } from "../useCatalog";
import { categoryLabel, useI18n } from "../i18n";
import { useTheme } from "../ThemeContext";
import { cn, CITIES } from "../utils";

export function Shell({ overlay = false, children }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader overlay={overlay} />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader({ overlay }) {
  const { t, locale, setLocale } = useI18n();
  const { resolved, toggle } = useTheme();
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const { cart } = useCart();
  const { events } = useCatalog();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [citiesOpen, setCitiesOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const dark = overlay && !scrolled;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || !events) return [];
    return events
      .filter((event) => `${event.titleFr} ${event.titleAr} ${event.city} ${event.venueFr}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [events, query]);

  const cartCount = cart?.lines?.reduce((sum, line) => sum + line.qty, 0) ?? 0;

  const goCity = (city) => {
    setCitiesOpen(false);
    setOpen(false);
    navigate(`/explorer?ville=${encodeURIComponent(city)}`);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition",
        dark ? "border-transparent bg-encre/40 text-foam backdrop-blur-md" : "border-line/10 bg-card/95 text-ink backdrop-blur",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:px-8">
        <button
          className="inline-flex size-11 items-center justify-center rounded-full lg:hidden"
          aria-label={open ? t("close") : t("openMenu")}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <Link to="/" className="font-display text-xl font-extrabold tracking-tight">
          Eventick<span className={dark ? "text-safran" : "text-lagon"}>.ma</span>
        </Link>
        <div className="relative hidden md:block">
          <button
            type="button"
            className={cn(
              "inline-flex h-10 items-center gap-1 whitespace-nowrap rounded-full px-3 text-sm",
              dark ? "bg-foam/10" : "bg-paper",
            )}
            onClick={() => setCitiesOpen((value) => !value)}
          >
            <MapPin className="size-4 text-lagon" />
            {t("allMorocco")}
            <ChevronDown className="size-4" />
          </button>
          {citiesOpen ? (
            <div className="absolute start-0 top-12 z-50 w-52 rounded-xl border border-line/10 bg-card p-2 text-ink shadow-pop">
              <button type="button" className="block w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-paper" onClick={() => goCity("")}>
                {t("allMorocco")}
              </button>
              {CITIES.map((city) => (
                <button
                  key={city}
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-paper"
                  onClick={() => goCity(city)}
                >
                  {city}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <nav className="ms-4 hidden items-center gap-4 text-sm font-semibold lg:flex">
          <Link to="/explorer">{t("explore")}</Link>
          <Link to="/explorer?cat=festivals">{t("festivals")}</Link>
          <Link to="/explorer?cat=humour">{t("concerts")}</Link>
          <Link to="/explorer?cat=culture">{t("culture")}</Link>
          <Link to="/pro">{t("pro")}</Link>
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              className={cn("inline-flex size-11 items-center justify-center rounded-full", dark ? "bg-foam/10" : "bg-paper")}
              aria-label={t("explore")}
              onClick={() => setSearchOpen((value) => !value)}
            >
              <Search className="size-4" />
            </button>
            {searchOpen ? (
              <div className="absolute end-0 top-12 z-50 w-72 rounded-xl border border-line/10 bg-card p-2 text-ink shadow-pop">
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("searchPh")}
                  className="field h-11"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      setSearchOpen(false);
                      navigate(`/explorer?q=${encodeURIComponent(query)}`);
                    }
                  }}
                />
                <ul className="mt-2">
                  {results.map((event) => (
                    <li key={event.slug}>
                      <Link
                        to={`/evenements/${event.slug}`}
                        className="block rounded-lg px-2 py-2 text-sm hover:bg-paper"
                        onClick={() => setSearchOpen(false)}
                      >
                        <span className="font-semibold">{locale === "ar" ? event.titleAr : event.titleFr}</span>
                        <span className="mt-0.5 block text-xs text-muted">{event.city}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className={cn("hidden items-center rounded-full p-1 text-xs font-bold sm:flex", dark ? "bg-foam/10" : "bg-paper")}>
            <button
              type="button"
              className={cn("rounded-full px-2 py-1", locale === "fr" && (dark ? "bg-foam text-encre" : "bg-card text-encre shadow-card"))}
              onClick={() => setLocale("fr")}
            >
              {t("langFr")}
            </button>
            <button
              type="button"
              className={cn("rounded-full px-2 py-1", locale === "ar" && (dark ? "bg-foam text-encre" : "bg-card text-encre shadow-card"))}
              onClick={() => setLocale("ar")}
            >
              {t("langAr")}
            </button>
          </div>
          <button
            type="button"
            onClick={toggle}
            aria-label={resolved === "dark" ? t("themeLight") : t("themeDark")}
            title={resolved === "dark" ? t("themeLight") : t("themeDark")}
            className={cn("hidden size-11 items-center justify-center rounded-full sm:inline-flex", dark ? "hover:bg-foam/10" : "hover:bg-paper")}
          >
            {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <span className={cn("hidden rounded-full px-3 py-1 font-mono text-xs font-bold md:inline", dark ? "bg-foam/10" : "bg-paper")}>
            {t("mad")}
          </span>
          <Link to="/paiement" className="relative inline-flex size-11 items-center justify-center rounded-full" aria-label={t("cart")}>
            <Ticket className="size-4" />
            {cartCount > 0 ? (
              <span className="absolute end-1 top-1 inline-flex size-4 items-center justify-center rounded-full bg-safran text-xs font-bold text-encre">
                {cartCount}
              </span>
            ) : null}
          </Link>
          <Link to="/organiser" className="hidden h-11 items-center rounded-full bg-safran px-4 text-sm font-semibold text-encre sm:inline-flex">
            + {t("create")}
          </Link>
          {!loading && user ? (
            <span className="flex items-center gap-1">
              <Link
                to="/billets"
                aria-label={t("account")}
                className="inline-flex size-11 items-center justify-center rounded-full bg-lagon font-display text-sm font-extrabold text-foam"
              >
                {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
              </Link>
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate("/");
                }}
                aria-label={t("signOut")}
                title={t("signOut")}
                className={cn("inline-flex size-11 items-center justify-center rounded-full", dark ? "bg-foam/10" : "bg-paper")}
              >
                <LogOut className="size-4" />
              </button>
            </span>
          ) : (
            <>
              <Link
                to="/login"
                aria-label={t("signIn")}
                className="inline-flex size-11 items-center justify-center rounded-full bg-encre text-foam sm:hidden"
              >
                <CircleUserRound className="size-5" />
              </Link>
              <Link to="/login" className="hidden h-11 items-center rounded-full bg-encre px-4 text-sm font-semibold text-foam sm:inline-flex">
                {t("signIn")}
              </Link>
            </>
          )}
        </div>
      </div>
      {open ? (
        <div className="border-t border-line/10 bg-card px-4 py-4 text-ink lg:hidden">
          <div className="grid gap-2 text-base font-semibold">
            <Link to="/explorer" onClick={() => setOpen(false)}>{t("explore")}</Link>
            <Link to="/explorer?cat=festivals" onClick={() => setOpen(false)}>{t("festivals")}</Link>
            <Link to="/explorer?cat=humour" onClick={() => setOpen(false)}>{t("concerts")}</Link>
            <Link to="/explorer?cat=culture" onClick={() => setOpen(false)}>{t("culture")}</Link>
            <Link to="/pro" onClick={() => setOpen(false)}>{t("pro")}</Link>
            <Link to="/billets" onClick={() => setOpen(false)}>{t("account")}</Link>
            {!loading && !user ? (
              <Link to="/login" onClick={() => setOpen(false)}>{t("signIn")}</Link>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="rounded-full bg-paper px-3 py-2 text-sm" onClick={() => goCity("")}>
              {t("allMorocco")}
            </button>
            {CITIES.map((city) => (
              <button key={city} type="button" className="rounded-full bg-paper px-3 py-2 text-sm" onClick={() => goCity(city)}>
                {city}
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className="rounded-full bg-paper px-3 py-2 text-sm font-bold" onClick={() => setLocale("fr")}>
              FR
            </button>
            <button type="button" className="rounded-full bg-paper px-3 py-2 text-sm font-bold" onClick={() => setLocale("ar")}>
              عربي
            </button>
            <button type="button" className="inline-flex items-center gap-2 rounded-full bg-paper px-3 py-2 text-sm font-bold" onClick={toggle}>
              {resolved === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {resolved === "dark" ? t("themeLight") : t("themeDark")}
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function SiteFooter() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <footer className="mt-16 bg-encre text-foam">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3 md:px-8">
        <Trust icon={<ShieldCheck className="size-5" />} title={t("trustPay")} body={t("trustPayBody")} />
        <Trust icon={<QrCode className="size-5" />} title={t("trustQr")} body={t("trustQrBody")} />
        <Trust icon={<Headphones className="size-5" />} title={t("trustHelp")} body={t("trustHelpBody")} />
      </div>
      <div className="border-t border-foam/10">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4 md:px-8">
          <div>
            <p className="font-display text-xl font-extrabold">
              Eventick<span className="text-safran">.ma</span>
            </p>
            <p className="mt-3 text-sm text-mist">{t("footerBlurb")}</p>
          </div>
          <div>
            <p className="font-semibold">{t("categories")}</p>
            <ul className="mt-3 space-y-2 text-sm text-mist">
              {["festivals", "humour", "sport", "nightlife", "culture", "salons"].map((id) => (
                <li key={id}>
                  <Link to={`/explorer?cat=${id}`} className="hover:text-foam">
                    {categoryLabel(id, t)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold">{t("cities")}</p>
            <ul className="mt-3 space-y-2 text-sm text-mist">
              {CITIES.map((city) => (
                <li key={city}>
                  <Link to={`/explorer?ville=${encodeURIComponent(city)}`} className="hover:text-foam">
                    {city}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return;
              setSent(true);
              setEmail("");
            }}
          >
            <p className="font-semibold">{t("stay")}</p>
            <p className="mt-2 text-sm text-mist">{t("stayBody")}</p>
            <label className="mt-3 flex items-center gap-2 rounded-full bg-foam/10 pe-1 ps-3">
              <Mail className="size-4 text-mist" />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("emailPh")}
                className="h-11 w-full bg-transparent text-sm text-foam outline-none placeholder:text-mist"
                type="email"
              />
            </label>
            <button className="mt-3 h-11 w-full rounded-full bg-lagon text-sm font-semibold text-foam" type="submit">
              {sent ? "✓" : t("subscribe")}
            </button>
          </form>
        </div>
      </div>
      <div className="border-t border-foam/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-mist md:flex-row md:items-center md:justify-between md:px-8">
          <p>{t("rights")}</p>
          <div className="flex gap-4">
            <Link to="/legal">{t("cgu")}</Link>
            <Link to="/legal">{t("privacy")}</Link>
            <Link to="/aide">{t("support")}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function Trust({ icon, title, body }) {
  return (
    <div className="flex gap-3">
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-lagon text-foam">{icon}</span>
      <div>
        <p className="font-display text-lg font-bold">{title}</p>
        <p className="mt-1 text-sm text-mist">{body}</p>
      </div>
    </div>
  );
}
