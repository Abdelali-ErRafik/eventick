import { Info } from "lucide-react";
import { SiteFooter } from "./chrome/SiteFooter";
import { SiteHeader } from "./chrome/SiteHeader";
import { useCatalog } from "../useCatalog";
import { useI18n } from "../i18n";

/**
 * The public page frame.
 *
 * `overlay` lets a screen with a full-bleed hero (Home) render the header
 * transparently over the image until the page scrolls.
 *
 * Header and footer live in ./chrome. This file used to hold all three in 384
 * lines, which is how the header ended up with 20 controls in one bar and two
 * dropdowns that could not be dismissed.
 */
export function Shell({ overlay = false, children }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <DemoNotice />
      <SiteHeader overlay={overlay} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

/**
 * Says so, when the catalogue is demo data.
 *
 * The terms page already admitted the events and prices were "fictifs ou
 * indicatifs", but nobody reads the terms before browsing — so the site
 * looked like a live ticketing site selling real seats. This puts the
 * admission where it is actually seen.
 *
 * Driven by `demoCatalogue`, which is true only while NOT ONE event claims
 * to be real (see CatalogContext). So it disappears by itself the moment a
 * genuine date is published — there is no separate switch to forget.
 *
 * Deliberately above the header rather than floating over the page: it is
 * context for everything below it, not an alert to dismiss, and a visitor
 * who scrolls past it should not have it follow them around.
 */
function DemoNotice() {
  const { demoCatalogue } = useCatalog();
  const { t } = useI18n();
  if (!demoCatalogue) return null;

  return (
    <div className="bg-warn-bg text-warn" role="status">
      <div className="mx-auto flex max-w-7xl items-center gap-2.5 px-4 py-2 text-xs font-semibold md:px-8">
        <Info className="size-4 shrink-0" aria-hidden />
        <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
          {t("demoCatalogueTag")}
        </span>
        <span className="min-w-0">{t("demoCatalogue")}</span>
      </div>
    </div>
  );
}
