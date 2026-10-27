import { SiteFooter } from "./chrome/SiteFooter";
import { SiteHeader } from "./chrome/SiteHeader";

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
      <SiteHeader overlay={overlay} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
