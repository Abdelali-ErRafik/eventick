import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { TicketPass } from "@/components/ticket-pass";
import { Shell } from "@/components/shell";
import { money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { explorerSearch } from "@/lib/search";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/confirmation/$orderId")({
  component: ConfirmationPage,
});

function ConfirmationPage() {
  const { orderId } = Route.useParams();
  const { locale, t } = useI18n();
  const hydrated = useStore((state) => state.hydrated);
  const order = useStore((state) => state.orders.find((item) => item.id === orderId));

  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        {!hydrated ? <div className="h-64 animate-pulse rounded-xl bg-card" /> : null}
        {hydrated && !order ? (
          <div className="text-center">
            <h1 className="font-display text-3xl font-extrabold">{t("notFound")}</h1>
            <Link to="/billets" className="mt-4 inline-flex h-12 items-center rounded-full bg-lagon px-5 font-semibold text-foam">
              {t("seeTickets")}
            </Link>
          </div>
        ) : null}
        {order ? (
          <>
            <div className="text-center">
              <span className="mx-auto inline-flex size-16 items-center justify-center rounded-full bg-lagon text-foam">
                <Check className="size-8" />
              </span>
              <h1 className="mt-4 font-display text-4xl font-extrabold">{t("paid")}</h1>
              <p className="mt-2 text-muted">{t("paidBody")}</p>
              <p className="mt-3 font-mono text-sm">
                {t("orderRef")} {order.id} · {t("auth")} {order.authCode}
              </p>
              <p className="mt-1 font-display text-3xl font-extrabold tabular-nums">{money(order.total, locale)}</p>
            </div>
            <div className="mt-8 space-y-4">
              {order.tickets.map((ticket) => (
                <TicketPass key={ticket.id} ticket={ticket} />
              ))}
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/billets" className="inline-flex h-12 items-center rounded-full bg-lagon px-5 text-sm font-semibold text-foam">
                {t("seeTickets")}
              </Link>
              <Link to="/explorer" search={explorerSearch()} className="inline-flex h-12 items-center rounded-full border border-line/15 px-5 text-sm font-semibold">
                {t("another")}
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </Shell>
  );
}
