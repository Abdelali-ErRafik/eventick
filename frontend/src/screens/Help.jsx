import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { useI18n } from "../i18n";

const FAQS = [
  ["faq1q", "faq1a"],
  ["faq2q", "faq2a"],
  ["faq3q", "faq3a"],
  ["faq4q", "faq4a"],
];

export default function Help() {
  const { t } = useI18n();
  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <h1 className="font-display text-4xl font-extrabold">{t("helpTitle")}</h1>
        <p className="mt-2 text-muted">{t("helpLead")}</p>
        <div className="mt-6 space-y-3">
          {FAQS.map(([q, a]) => (
            <article key={q} className="rounded-card border border-line/10 bg-card p-4 shadow-card">
              <h2 className="font-display text-lg font-bold">{t(q)}</h2>
              <p className="mt-1 text-sm text-muted">{t(a)}</p>
            </article>
          ))}
        </div>
        <a
          className="mt-6 inline-flex h-12 items-center rounded-full bg-action px-5 text-sm font-semibold text-action-fg"
          href="https://wa.me/212537001122"
          target="_blank"
          rel="noreferrer"
        >
          {t("whatsapp")}
        </a>
        <p className="mt-4">
          <Link to="/legal" className="text-sm font-semibold text-primary">
            {t("cgu")}
          </Link>
        </p>
      </div>
    </Shell>
  );
}
