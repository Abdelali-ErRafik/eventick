import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/legal")({
  component: LegalPage,
});

function LegalPage() {
  const { t } = useI18n();
  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <h1 className="font-display text-4xl font-extrabold">{t("legalTitle")}</h1>
        <p className="mt-4 text-base leading-relaxed text-muted">{t("legalBody")}</p>
        <Link to="/aide" className="mt-6 inline-flex text-sm font-semibold text-lagon">
          {t("support")}
        </Link>
      </div>
    </Shell>
  );
}
