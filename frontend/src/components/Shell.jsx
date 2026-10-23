import { Link, useNavigate } from "react-router-dom";
import { CircleUserRound, Menu, Ticket, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../AuthContext";
import { useI18n } from "../i18n";
import { cn } from "../utils";

export function Shell({ children }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  const { t, locale, setLocale } = useI18n();
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line/10 bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/" className="font-display text-xl font-extrabold tracking-tight text-encre">
          even<span className="text-lagon">tick</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold md:flex">
          <Link to="/explorer">{t("explore")}</Link>
          <Link to="/explorer?cat=festivals">{t("festivals")}</Link>
          <Link to="/organiser">{t("create")}</Link>
          <Link to="/pro">{t("pro")}</Link>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocale(locale === "fr" ? "ar" : "fr")}
            className="hidden rounded-full border border-line/15 px-3 py-1.5 text-xs font-bold sm:inline-flex"
          >
            {locale === "fr" ? "عربي" : "FR"}
          </button>

          <Link to="/billets" className="hidden h-10 items-center gap-1 rounded-full border border-line/15 px-3 text-sm font-semibold sm:inline-flex">
            <Ticket className="size-4" />
            {t("account")}
          </Link>

          {!loading && user ? (
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/");
              }}
              className="hidden h-10 items-center rounded-full bg-encre px-4 text-sm font-semibold text-foam sm:inline-flex"
            >
              {t("close")}
            </button>
          ) : (
            <Link to="/login" className="hidden h-10 items-center gap-1 rounded-full bg-lagon px-4 text-sm font-semibold text-foam sm:inline-flex">
              <CircleUserRound className="size-4" />
            </Link>
          )}

          <button type="button" className="md:hidden" onClick={() => setOpen((v) => !v)} aria-label={t("openMenu")}>
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav className={cn("flex flex-col gap-1 border-t border-line/10 bg-card px-4 py-3 text-sm font-semibold md:hidden")}>
          <Link to="/explorer" onClick={() => setOpen(false)}>{t("explore")}</Link>
          <Link to="/billets" onClick={() => setOpen(false)}>{t("account")}</Link>
          <Link to="/organiser" onClick={() => setOpen(false)}>{t("create")}</Link>
          <Link to="/pro" onClick={() => setOpen(false)}>{t("pro")}</Link>
          {user ? (
            <button type="button" className="text-start" onClick={() => { logout(); setOpen(false); navigate("/"); }}>
              {t("close")}
            </button>
          ) : (
            <Link to="/login" onClick={() => setOpen(false)}>{t("signIn")}</Link>
          )}
        </nav>
      ) : null}
    </header>
  );
}

function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="mt-16 border-t border-line/10 bg-encre py-10 text-mist">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4">
        <p className="font-display text-xl font-extrabold text-foam">
          even<span className="text-safran">tick</span>
        </p>
        <p className="font-mono text-xs">Eventick · {t("secureMad")}</p>
        <nav className="flex flex-wrap gap-4 text-sm">
          <Link to="/legal">Legal</Link>
          <Link to="/aide">{t("account")}</Link>
        </nav>
      </div>
    </footer>
  );
}
