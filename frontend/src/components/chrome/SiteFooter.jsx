import { Link } from "react-router-dom";
import { Headphones, Mail, QrCode, ShieldCheck } from "lucide-react";
import { categoryLabel, useI18n } from "../../i18n";
import { Button, Input } from "../../ui";
import { CITIES, cn } from "../../utils";

const CATEGORIES = ["festivals", "humour", "sport", "nightlife", "culture", "salons"];

/**
 * The public site footer.
 *
 * Structurally close to the previous one — the content was right — but the
 * hand-rolled controls are gone and the trust row now uses the same card
 * language as the rest of the site instead of its own circle-and-text layout.
 *
 * The newsletter form is deliberately marked as not yet wired: it previously
 * showed a tick and silently dropped the address, which is worse than not
 * offering it. See the note on the input below.
 *
 * Shape v2: the trust-row icon chip was bg-stage-fg/10 on a bg-stage footer
 * — the same low-contrast dark-on-dark pattern fixed on the Home page's own
 * trust row and the category tiles — so it read as a near-invisible dark
 * square. Each perk now gets a distinct colour chip, same language used
 * everywhere else on the page.
 */
export function SiteFooter() {
  const { t } = useI18n();

  return (
    // The entire footer is deliberately always dark, matching the reference
    // (webook.com's own footer stays black in every theme) -- see the note
    // on --et-stage in styles.css.
    <footer className="mt-20 bg-stage text-stage-fg">
      {/* Trust */}
      <div className="border-b border-stage-fg/10">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 md:grid-cols-3 md:px-8">
          <Trust tone="bg-primary text-primary-fg" icon={<ShieldCheck className="size-5" />} title={t("trustPay")} body={t("trustPayBody")} />
          <Trust tone="bg-accent text-accent-fg" icon={<QrCode className="size-5" />} title={t("trustQr")} body={t("trustQrBody")} />
          <Trust tone="bg-secondary text-secondary-fg" icon={<Headphones className="size-5" />} title={t("trustHelp")} body={t("trustHelpBody")} />
        </div>
      </div>

      {/* Directory */}
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:px-8 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <p className="font-display text-heading font-extrabold">
            Eventick<span className="text-accent">.ma</span>
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-stage-muted">{t("footerBlurb")}</p>
        </div>

        <FooterColumn title={t("categories")}>
          {CATEGORIES.map((id) => (
            <FooterLink key={id} to={`/explorer?cat=${id}`}>
              {categoryLabel(id, t)}
            </FooterLink>
          ))}
        </FooterColumn>

        <FooterColumn title={t("cities")}>
          {CITIES.map((city) => (
            <FooterLink key={city} to={`/explorer?ville=${encodeURIComponent(city)}`}>
              {city}
            </FooterLink>
          ))}
        </FooterColumn>

        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold">{t("stay")}</p>
            {/* An explicit "coming soon" badge instead of leaning on the
                form's disabled opacity alone to say "this doesn't work yet"
                — the badge says so directly, so it reads as a deliberate
                preview rather than a broken control. */}
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
              {t("comingSoon")}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-stage-muted">{t("stayBody")}</p>
          {/* Disabled on purpose. There is no subscribe endpoint, and the old
              version showed a success tick while discarding the address —
              a confirmation for something that did not happen. */}
          <label className="mt-4 flex items-center gap-2 rounded-full border border-stage-fg/10 bg-stage-fg/5 ps-3.5 pe-1 opacity-70">
            <Mail className="size-4 shrink-0 text-stage-muted" aria-hidden />
            <Input
              tone="stage"
              type="email"
              disabled
              placeholder={t("emailPh")}
              aria-label={t("emailPh")}
              className="w-full min-w-0 border-none bg-transparent px-0 text-sm"
            />
          </label>
          <Button variant="inverse" full className="mt-3" disabled>
            {t("subscribe")}
          </Button>
        </div>
      </div>

      {/* Legal */}
      <div className="border-t border-stage-fg/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-stage-muted md:flex-row md:items-center md:justify-between md:px-8">
          <p>{t("rights")}</p>
          <nav className="flex flex-wrap gap-5" aria-label={t("cgu")}>
            <Link to="/legal" className="transition hover:text-stage-fg">
              {t("cgu")}
            </Link>
            <Link to="/legal" className="transition hover:text-stage-fg">
              {t("privacy")}
            </Link>
            <Link to="/aide" className="transition hover:text-stage-fg">
              {t("support")}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

function Trust({ tone, icon, title, body }) {
  return (
    <div className="flex gap-3.5">
      <span className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-control", tone)} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-display text-subhead font-bold">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-stage-muted">{body}</p>
      </div>
    </div>
  );
}

function FooterColumn({ title, children }) {
  return (
    <div>
      <p className="text-sm font-bold">{title}</p>
      <ul className="mt-3 grid gap-2.5 text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }) {
  return (
    <li>
      <Link to={to} className="text-stage-muted transition hover:text-stage-fg">
        {children}
      </Link>
    </li>
  );
}
