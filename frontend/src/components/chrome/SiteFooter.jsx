import { Link } from "react-router-dom";
import { Headphones, Mail, QrCode, ShieldCheck } from "lucide-react";
import { categoryLabel, useI18n } from "../../i18n";
import { Button } from "../../ui";
import { CITIES } from "../../utils";

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
 */
export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="mt-20 bg-encre text-foam">
      {/* Trust */}
      <div className="border-b border-foam/10">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 md:grid-cols-3 md:px-8">
          <Trust icon={<ShieldCheck className="size-5" />} title={t("trustPay")} body={t("trustPayBody")} />
          <Trust icon={<QrCode className="size-5" />} title={t("trustQr")} body={t("trustQrBody")} />
          <Trust icon={<Headphones className="size-5" />} title={t("trustHelp")} body={t("trustHelpBody")} />
        </div>
      </div>

      {/* Directory */}
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:px-8 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <p className="font-display text-heading font-extrabold">
            Eventick<span className="text-accent">.ma</span>
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-mist">{t("footerBlurb")}</p>
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
          <p className="text-sm font-bold">{t("stay")}</p>
          <p className="mt-2 text-sm leading-relaxed text-mist">{t("stayBody")}</p>
          {/* Disabled on purpose. There is no subscribe endpoint, and the old
              version showed a success tick while discarding the address —
              a confirmation for something that did not happen. */}
          <label className="mt-4 flex items-center gap-2 rounded-full bg-foam/10 ps-3.5 pe-1 opacity-60">
            <Mail className="size-4 shrink-0 text-mist" aria-hidden />
            <input
              type="email"
              disabled
              placeholder={t("emailPh")}
              aria-label={t("emailPh")}
              className="h-11 w-full min-w-0 bg-transparent text-sm text-foam outline-none placeholder:text-mist"
            />
          </label>
          <Button variant="inverse" full className="mt-3" disabled>
            {t("subscribe")}
          </Button>
        </div>
      </div>

      {/* Legal */}
      <div className="border-t border-foam/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-xs text-mist md:flex-row md:items-center md:justify-between md:px-8">
          <p>{t("rights")}</p>
          <nav className="flex flex-wrap gap-5" aria-label={t("cgu")}>
            <Link to="/legal" className="transition hover:text-foam">
              {t("cgu")}
            </Link>
            <Link to="/legal" className="transition hover:text-foam">
              {t("privacy")}
            </Link>
            <Link to="/aide" className="transition hover:text-foam">
              {t("support")}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

function Trust({ icon, title, body }) {
  return (
    <div className="flex gap-3.5">
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-control bg-foam/10 text-accent" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-display text-subhead font-bold">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-mist">{body}</p>
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
      <Link to={to} className="text-mist transition hover:text-foam">
        {children}
      </Link>
    </li>
  );
}
