import type { Metadata } from "next";
import { siteUrl } from "../lib/catalog-server";
import "./styles.css";

/*
 * The site-wide head.
 *
 * This used to be a single flat {title, description} pair, which meant every
 * URL on the site — home, each event, the explorer — served one identical
 * title and one identical description. `title.template` changes that: a page
 * that sets its own title gets "<its title> · Eventick", and only pages that
 * set nothing fall back to `title.default`.
 *
 * `metadataBase` is what lets child pages declare a canonical as a path
 * rather than repeating the origin. It reads NEXT_PUBLIC_SITE_URL, which has
 * to be the real domain in production — see catalog-server.ts.
 *
 * The description now says what the site DOES ("réservez vos billets") and
 * where, rather than listing categories. It deliberately drops the old
 * "Billetterie N°1 au Maroc" framing: an unverifiable superlative is a poor
 * search snippet and an easy complaint to attract.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Eventick · Billets de concerts et festivals au Maroc",
    template: "%s · Eventick",
  },
  description:
    "Réservez vos billets pour les concerts, festivals, spectacles et rencontres sportives au Maroc. E-billet immédiat avec QR code, paiement sécurisé en dirhams.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Eventick",
    locale: "fr_MA",
    title: "Eventick · Billets de concerts et festivals au Maroc",
    description:
      "Réservez vos billets pour les concerts, festivals, spectacles et rencontres sportives au Maroc. E-billet immédiat avec QR code.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/*
          New visual identity (2026 refresh): Space Grotesk for display
          (geometric, distinctive — replaces Bricolage Grotesque), Inter for
          body copy (replaces Instrument Sans), JetBrains Mono for refs and
          numerals (replaces DM Mono). Noto Sans Arabic stays for RTL.
        */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+Arabic:wght@400;500;600;700;800&display=swap"
        />
        <script
          // Applies the resolved theme before first paint. Dark is the
          // product default (see ThemeContext) — this must agree with it, or
          // a first-time visitor sees a flash of light before JS swaps it to
          // dark. "auto" is the one case this script defers on: it removes
          // any data-theme attribute and lets styles.css's own
          // prefers-color-scheme media query decide, same as ThemeContext
          // does once it mounts.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("eventick-theme");if(t==="light"){document.documentElement.dataset.theme="light";}else if(t!=="auto"){document.documentElement.dataset.theme="dark";}}catch(e){document.documentElement.dataset.theme="dark";}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
