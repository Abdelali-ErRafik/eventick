import { useState } from "react";
import { CheckCircle2, QrCode, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../api";
import { useI18n } from "../../i18n";
import { Badge, Btn, Card, EmptyState, PageHead, PersonCell } from "./ui";
import { cn } from "../../utils";
import { text } from "./copy";

export default function Gate() {
  const { locale } = useI18n();
  const t = text[locale];
  const [ref, setRef] = useState("");
  const [result, setResult] = useState(null);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const scanned = ref.trim();
    if (!scanned || busy) return;
    setBusy(true);
    try {
      const res = await api.post("/gate/check-in", { ref: scanned });
      const holder = res.ticket?.holderName ?? "";
      setResult({ ok: true, ref: scanned, holder, message: t.admitted });
      setLog((prev) => [{ ref: scanned, code: "ok", holder, at: new Date() }, ...prev].slice(0, 10));
      toast.success(t.admitted);
      setRef("");
    } catch (err) {
      const code = err.data?.result ?? "missing";
      const message = code === "used" ? t.already : code === "cancelled" ? t.cancelled : code === "moved" ? t.moved : t.missing;
      setResult({ ok: false, ref: scanned, holder: "", message });
      setLog((prev) => [{ ref: scanned, code, holder: "", at: new Date() }, ...prev].slice(0, 10));
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const admitted = log.filter((entry) => entry.code === "ok").length;

  return (
    <div>
      <PageHead title={t.gate} sub={t.gateSub} />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Card className="bg-encre text-foam">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-foam/10 text-safran" aria-hidden>
              <QrCode className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-extrabold">{t.scan}</h2>
              <p className="text-xs text-mist">{t.gateLead}</p>
            </div>
          </div>
          <form className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={submit}>
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="ET-2026-0AS125"
              autoFocus
              className="h-14 w-full rounded-xl border border-foam/20 bg-foam px-4 font-mono text-lg text-encre outline-none focus:border-safran focus:ring-[3px] focus:ring-safran/30"
            />
            <button
              type="submit"
              disabled={busy}
              className="h-14 shrink-0 rounded-full bg-safran px-6 text-sm font-semibold text-encre transition hover:brightness-105 active:scale-[0.97] disabled:opacity-50"
            >
              {t.check}
            </button>
          </form>

          <div
            className={cn(
              "mt-5 flex items-center gap-3 rounded-xl px-4 py-4",
              !result && "bg-foam/5 text-mist",
              result?.ok && "bg-lagon/25 text-foam",
              result && !result.ok && "bg-corail/25 text-foam",
            )}
            aria-live="polite"
          >
            {result ? (
              result.ok ? (
                <CheckCircle2 className="size-6 shrink-0 text-lagon" />
              ) : (
                <XCircle className="size-6 shrink-0 text-corail" />
              )
            ) : null}
            <div className="min-w-0">
              <p className="font-display text-base font-extrabold">{result ? result.message : t.waiting}</p>
              {result ? (
                <p className="truncate font-mono text-xs opacity-80">
                  {result.holder ? `${result.holder} · ` : ""}
                  {result.ref}
                </p>
              ) : null}
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold">{t.recent}</h2>
            {log.length > 0 ? (
              <Badge tone="green">
                {admitted}/{log.length}
              </Badge>
            ) : null}
          </div>
          {log.length === 0 ? (
            <EmptyState icon="🎫" title={t.waiting} />
          ) : (
            <ul className="grid gap-2">
              {log.map((entry, i) => (
                <li key={`${entry.ref}-${i}`} className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2.5">
                  <PersonCell
                    name={entry.holder || entry.ref}
                    sub={entry.at.toLocaleTimeString(locale === "ar" ? "ar-MA" : "fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  />
                  <Badge tone={entry.code === "ok" ? "green" : entry.code === "used" ? "amber" : "red"}>
                    {entry.code === "ok" ? t.valid : entry.code === "used" ? t.used : entry.code === "moved" ? t.transferred : t.missing}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {log.length > 0 ? (
            <Btn variant="secondary" size="sm" className="mt-3 w-full" onClick={() => setLog([])}>
              {t.close}
            </Btn>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
