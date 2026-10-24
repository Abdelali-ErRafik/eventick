import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AuthProvider } from "@/lib/auth/provider";
import { I18nProvider } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import appCss from "../styles.css?url";

const APP_NAME = "Eventick";

function LocaleBridge({ children }: { children: ReactNode }) {
  const locale = useStore((state) => state.locale);

  useEffect(() => {
    void Promise.resolve(useStore.persist.rehydrate()).finally(() => {
      useStore.getState().setHydrated();
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "ar" ? "ar" : "fr";
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${APP_NAME} — Billetterie au Maroc` },
      { name: "description", content: "Réservez festivals, concerts, matchs et spectacles au Maroc. E-billets QR et paiement en dirhams." },
      { name: "theme-color", content: "#0B7A75" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap",
      },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <LocaleBridge>
            <Outlet />
          </LocaleBridge>
          <Toaster position="top-center" />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
