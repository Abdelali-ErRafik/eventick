import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../../AuthContext";
import { LOCALES, LOCALE_SHORT, useI18n } from "../../../i18n";
import { useTheme } from "../../../ThemeContext";
import { Container } from "../../../ui";
import { text } from "../copy";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const COLLAPSE_KEY = "eventick-dash-collapsed";

/**
 * Dashboard scaffold: sidebar + topbar + the page's own content.
 *
 * Holds only layout and the chrome's own state. Everything visual lives in
 * Sidebar and Topbar, and everything reusable lives in src/ui — so a dashboard
 * page never reaches for a one-off button again.
 */
export default function DashboardShell({ sections, children }) {
  const { locale, setLocale } = useI18n();
  const t = text[locale];
  const { user, logout } = useAuth();
  const { resolved, toggle } = useTheme();
  const { pathname } = useLocation();

  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // Storage can be blocked outright in a private window; expanded is the
      // safe default because it is the discoverable one.
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // A preference that cannot be saved still applies for this session.
      }
      return next;
    });
  }, []);

  // Navigating on a phone must dismiss the drawer, or the new page renders
  // behind an overlay the user then has to dismiss by hand.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // The topbar title comes from the nav itself, so there is one source of
  // truth for what this page is called.
  const current =
    [...sections].sort((a, b) => b.to.length - a.to.length).find((section) => pathname === section.to || pathname.startsWith(`${section.to}/`)) ??
    sections[0];

  const closeNav = useCallback(() => setNavOpen(false), []);

  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <Sidebar
        sections={sections}
        open={navOpen}
        onClose={closeNav}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        labels={{
          nav: t.navLabel,
          close: t.close,
          collapse: collapsed ? t.expand : t.collapse,
          expand: t.expand,
          pending: t.pendingItems,
          brand: t.brand,
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          eyebrow={current?.group}
          title={current?.label ?? t.brand}
          onOpenNav={() => setNavOpen(true)}
          user={user}
          onLogout={logout}
          theme={resolved}
          onToggleTheme={toggle}
          locales={LOCALES}
          locale={locale}
          onSetLocale={setLocale}
          localeShort={LOCALE_SHORT}
          labels={{
            openMenu: t.openMenu,
            market: t.market,
            userMenu: t.userMenu,
            signOut: t.signOut,
            themeLight: t.themeLight,
            themeDark: t.themeDark,
            langLabel: t.langLabel,
          }}
        />

        <main className="flex-1 pb-16 pt-6">
          <Container size="dash">{children}</Container>
        </main>
      </div>
    </div>
  );
}
