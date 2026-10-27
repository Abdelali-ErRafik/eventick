import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Keyboard, QrCode, ScanLine, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../api";
import { useI18n } from "../../i18n";
import QrScanner from "./QrScanner";
import { Badge, Btn, Card, EmptyState, PageHead, PersonCell } from "./ui";
import { cn } from "../../utils";
import {
  flushQueue,
  loadManifest,
  loadQueue,
  manifestHas,
  queueScan,
  refFromScan,
  saveManifest,
} from "./offlineGate";
import { text } from "./copy";

export default function Gate() {
  const { locale } = useI18n();
  const t = text[locale];
  const [mode, setMode] = useState("scan");
  const [ref, setRef] = useState("");
  const [result, setResult] = useState(null);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const [events, setEvents] = useState([]);
  const [manifest, setManifest] = useState(() => loadManifest());
  const [queued, setQueued] = useState(() => loadQueue().length);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    api.get("/organiser/events").then((data) => setEvents(data.events)).catch(() => {});
  }, []);

  const downloadManifest = async (slug) => {
    try {
      const data = await api.get(`/gate/events/${slug}/manifest`);
      saveManifest(data);
      setManifest(data);
      toast.success(t.manifestReady.replace("{n}", String(data.refs.length)));
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Replay anything taken offline as soon as the network is back.
  const flush = useCallback(async () => {
    const { sent, conflicts } = await flushQueue((payload) => api.post("/gate/check-in", payload));
    setQueued(loadQueue().length);
    if (sent > 0) toast.success(t.queueSynced.replace("{n}", String(sent)));
    for (const conflict of conflicts) {
      toast.warning(`${conflict.payload.ref} · ${conflict.reason}`);
    }
  }, [t]);

  useEffect(() => {
    if (online && queued > 0) flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  /** One check-in attempt, from either the camera or the manual field. */
  const checkIn = useCallback(
    async (code, source) => {
      const scanned = String(code).trim();
      // Guard with a ref, not state: the camera loop can fire again before a
      // state update has rendered.
      if (!scanned || inFlight.current) return;
      inFlight.current = true;
      setBusy(true);

      // Offline: decide from the downloaded manifest and queue the scan. The
      // manifest says the ticket was valid when it was downloaded — it cannot
      // know whether another door has since admitted it, so the server has
      // the last word on replay.
      if (!navigator.onLine && manifest) {
        const bare = refFromScan(scanned);
        const known = manifestHas(manifest, bare);
        if (known) {
          setQueued(queueScan({ payload: { ref: scanned, source }, at: Date.now() }));
          setResult({ ok: true, ref: bare, holder: "", message: t.admittedOffline });
          setLog((prev) => [{ ref: bare, code: "ok", holder: "", at: new Date() }, ...prev].slice(0, 10));
          toast.success(t.admittedOffline);
        } else {
          setResult({ ok: false, ref: bare, holder: "", message: t.missing });
          setLog((prev) => [{ ref: bare, code: "missing", holder: "", at: new Date() }, ...prev].slice(0, 10));
          toast.error(t.missing);
        }
        setBusy(false);
        setTimeout(() => {
          inFlight.current = false;
        }, 600);
        return;
      }

      try {
        const res = await api.post("/gate/check-in", { ref: scanned, source });
        const holder = res.ticket?.holderName ?? "";
        setResult({ ok: true, ref: res.ticket?.ref ?? scanned, holder, message: t.admitted });
        setLog((prev) => [{ ref: res.ticket?.ref ?? scanned, code: "ok", holder, at: new Date() }, ...prev].slice(0, 10));
        toast.success(t.admitted);
        setRef("");
      } catch (err) {
        const code2 = err.data?.result ?? (err.status === 400 ? "invalid" : "missing");
        const message =
          code2 === "used"
            ? t.already
            : code2 === "cancelled"
              ? t.cancelled
              : code2 === "moved"
                ? t.moved
                : code2 === "invalid"
                  ? t.invalidCode
                  : t.missing;
        const shown = err.data?.ticket?.ref ?? scanned;
        setResult({ ok: false, ref: shown, holder: "", message });
        setLog((prev) => [{ ref: shown, code: code2, holder: "", at: new Date() }, ...prev].slice(0, 10));
        toast.error(message);
      } finally {
        setBusy(false);
        // Brief cooldown so a held ticket doesn't immediately retry.
        setTimeout(() => {
          inFlight.current = false;
        }, 600);
      }
    },
    [t, manifest],
  );

  const submitManual = (e) => {
    e.preventDefault();
    checkIn(ref, "manual");
  };

  const admitted = log.filter((entry) => entry.code === "ok").length;

  return (
    <div>
      <PageHead
        title={t.gate}
        sub={t.gateSub}
        actions={
          <div className="flex items-center rounded-full bg-paper p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setMode("scan")}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-2", mode === "scan" && "bg-card text-encre shadow-card")}
            >
              <ScanLine className="size-4" />
              {t.scanMode}
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-2", mode === "manual" && "bg-card text-encre shadow-card")}
            >
              <Keyboard className="size-4" />
              {t.manualEntry}
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line/10 bg-card p-3 shadow-card">
        <Badge tone={online ? "green" : "amber"}>
          {online ? t.online : t.offline}
        </Badge>
        {manifest ? (
          <span className="text-xs text-muted">{t.manifestFor.replace("{e}", manifest.eventSlug).replace("{n}", String(manifest.refs.length))}</span>
        ) : (
          <span className="text-xs text-muted">{t.noManifest}</span>
        )}
        {queued > 0 ? <Badge tone="amber">{t.queuedScans.replace("{n}", String(queued))}</Badge> : null}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <select
            className="h-10 rounded-xl border border-line/20 bg-card px-3 text-sm outline-none focus:border-lagon"
            defaultValue=""
            onChange={(e) => { if (e.target.value) downloadManifest(e.target.value); e.target.value = ""; }}
          >
            <option value="">{t.downloadManifest}</option>
            {events.map((ev) => (
              <option key={ev.slug} value={ev.slug}>{locale === "ar" ? ev.titleAr : ev.titleFr}</option>
            ))}
          </select>
          {queued > 0 && online ? (
            <Btn variant="secondary" size="sm" onClick={flush}>
              <Download className="size-4" />
              {t.syncNow}
            </Btn>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Card className="bg-encre text-foam">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-foam/10 text-safran" aria-hidden>
              <QrCode className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-extrabold">{mode === "scan" ? t.scanMode : t.scan}</h2>
              <p className="text-xs text-mist">{t.gateLead}</p>
            </div>
          </div>

          <div className="mt-5">
            {mode === "scan" ? (
              <QrScanner onScan={(code) => checkIn(code, "camera")} paused={busy} />
            ) : (
              <form className="grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={submitManual}>
                <input
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="ET-2027-GA6DAV66RQ"
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
            )}
          </div>

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
                    {entry.code === "ok"
                      ? t.valid
                      : entry.code === "used"
                        ? t.used
                        : entry.code === "moved"
                          ? t.transferred
                          : entry.code === "invalid"
                            ? t.invalidCode
                            : t.missing}
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
