import { Link } from "react-router-dom";
import { Shell } from "../components/Shell";
import { useI18n } from "../i18n";

export default function Legal() {
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
