import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../api";
import { useI18n } from "../../i18n";
import { text } from "./copy";

export default function Gate() {
  const { locale } = useI18n();
  const t = text[locale];
  const [ref, setRef] = useState("");
  const [result, setResult] = useState("");
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!ref.trim() || busy) return;
    setBusy(true);
    const scanned = ref.trim();
    try {
      const res = await api.post("/gate/check-in", { ref: scanned });
      const holder = res.ticket?.holderName ?? "";
      setResult(`${holder} · ${scanned}`);
      setLog((prev) => [{ ref: scanned, result: "ok", holder, at: new Date() }, ...prev].slice(0, 8));
      toast.success(t.admitted);
      setRef("");
    } catch (err) {
      const code = err.data?.result ?? "missing";
      const message = code === "used" ? t.already : code === "cancelled" ? t.cancelled : code === "moved" ? t.moved : t.missing;
      setResult(`${scanned} · ${message}`);
      setLog((prev) => [{ ref: scanned, result: code, holder: "", at: new Date() }, ...prev].slice(0, 8));
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold">{t.gate}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t.gateLead}</p>
      <form className="mt-6 grid gap-2 rounded-xl bg-encre p-4 text-foam sm:grid-cols-[1fr_auto]" onSubmit={submit}>
        <label>
          <span className="text-xs font-semibold text-mist">{t.scan}</span>
          <input className="field mt-1 h-14 bg-foam font-mono text-lg text-encre" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ET-2026-0AS125" />
        </label>
        <button className="h-14 self-end rounded-full bg-safran px-6 text-sm font-semibold text-encre disabled:opacity-50" type="submit" disabled={busy}>
          {t.check}
        </button>
      </form>
      <p className="mt-4 rounded-xl bg-card p-4 font-semibold shadow-card">{result || t.waiting}</p>
      <ul className="mt-4 grid gap-2">
        {log.map((entry, i) => (
          <li key={i} className="flex items-center justify-between rounded-lg bg-card px-3 py-3 text-sm">
            <span>
              {entry.at.toLocaleTimeString(locale === "ar" ? "ar-MA" : "fr-FR", { hour: "2-digit", minute: "2-digit" })} · {entry.result} · {entry.holder || "—"}
            </span>
            <span className="font-mono text-xs">{entry.ref}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
