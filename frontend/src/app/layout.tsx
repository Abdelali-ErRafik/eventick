import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Eventick · La billetterie qui se valide d'un geste",
  description:
    "Concerts, humour, festivals, sport, formations. Eventick vend des places pour le public marocain et africain.",
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
