import { useState } from "react";
import { api } from "../../api";

const RESULT_LABEL = {
  ok: { text: "Entrée validée", className: "bg-lagon text-foam" },
  used: { text: "Billet déjà utilisé", className: "bg-corail text-foam" },
  cancelled: { text: "Billet annulé", className: "bg-corail text-foam" },
  moved: { text: "Billet transféré", className: "bg-safran text-encre" },
  missing: { text: "Billet introuvable", className: "bg-corail text-foam" },
};

export default function Gate() {
  const [ref, setRef] = useState("");
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!ref.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.post("/gate/check-in", { ref: ref.trim() });
      setLog((prev) => [{ ref: ref.trim(), result: "ok", at: new Date(), holderName: res.ticket?.holderName }, ...prev].slice(0, 8));
    } catch (err) {
      const result = err.data?.result ?? "missing";
      setLog((prev) => [{ ref: ref.trim(), result, at: new Date() }, ...prev].slice(0, 8));
    } finally {
      setRef("");
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl">Porte</h1>
      <p className="mt-2 text-sm text-muted">
        Ce contrôle écrit dans la base partagée — deux appareils voient désormais le même état d'un billet.
      </p>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="ET-2026-0AS125"
          className="h-12 flex-1 rounded-lg border border-line/15 px-4 font-mono"
        />
        <button type="submit" disabled={busy} className="h-12 rounded-full bg-safran px-6 font-semibold text-encre disabled:opacity-50">
          Contrôler
        </button>
      </form>

      <div className="mt-6 grid gap-2">
        {log.map((entry, i) => {
          const label = RESULT_LABEL[entry.result] ?? RESULT_LABEL.missing;
          return (
            <div key={i} className="flex items-center justify-between rounded-lg border border-line/15 p-3 font-mono text-sm">
              <span>{entry.ref}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${label.className}`}>{label.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
