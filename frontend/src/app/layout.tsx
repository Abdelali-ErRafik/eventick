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
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=DM+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap"
        />
        <script
          // Applies the stored theme before first paint so dark mode doesn't flash light.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("eventick-theme");if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t;}}catch(e){}})();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
