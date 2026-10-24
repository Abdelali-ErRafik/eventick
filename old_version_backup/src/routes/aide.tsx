import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/aide")({
  component: HelpPage,
});

function HelpPage() {
  const { t } = useI18n();
  const faqs = [
    ["faq1q", "faq1a"],
    ["faq2q", "faq2a"],
    ["faq3q", "faq3a"],
    ["faq4q", "faq4a"],
  ] as const;

  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <h1 className="font-display text-4xl font-extrabold">{t("helpTitle")}</h1>
        <p className="mt-2 text-muted">{t("helpLead")}</p>
        <div className="mt-6 space-y-3">
          {faqs.map(([q, a]) => (
            <article key={q} className="rounded-xl border border-line/10 bg-card p-4 shadow-card">
              <h2 className="font-display text-lg font-bold">{t(q)}</h2>
              <p className="mt-1 text-sm text-muted">{t(a)}</p>
            </article>
          ))}
        </div>
        <a className="mt-6 inline-flex h-12 items-center rounded-full bg-lagon px-5 text-sm font-semibold text-foam" href="https://wa.me/212537001122" target="_blank" rel="noreferrer">
          {t("whatsapp")}
        </a>
        <p className="mt-4">
          <Link to="/legal" className="text-sm font-semibold text-lagon">
            {t("cgu")}
          </Link>
        </p>
      </div>
    </Shell>
  );
}
