import { useEffect, useRef, useState } from "react";
import { ExternalLink, Lock, ShieldCheck } from "lucide-react";
import { money } from "../api";
import { useI18n } from "../i18n";

/**
 * Hand-off to CMI.
 *
 * CMI is a redirect gateway, not an embeddable one: the card is typed on CMI's
 * own 3-D Secure page, which is why there is no card field here and why the
 * number never reaches Eventick. All this screen does is POST a signed form to
 * CMI and get out of the way.
 *
 * It must be a real form POST rather than a fetch: CMI replies with its own
 * payment page, so the browser has to navigate there, and the fields are
 * signed server-side (the `hash`) so nothing here can alter the amount.
 *
 * The submit is NOT automatic. An auto-submitting page flashes and jumps,
 * which looks like a hijack at the exact moment someone is about to type a
 * card number — and if CMI is slow or down, an invisible auto-post leaves a
 * blank screen with nothing to retry. So the hand-off is one deliberate
 * click, with the amount and destination stated first.
 */
export default function CmiRedirect({ action, fields, dueCents, onLeave }) {
  const { t, tf } = useI18n();
  const formRef = useRef(null);
  const [going, setGoing] = useState(false);

  // If the browser restores this page from history after the buyer comes back
  // (bfcache), re-enable the button instead of leaving it stuck on "going".
  useEffect(() => {
    const onRestore = (event) => {
      if (event.persisted) setGoing(false);
    };
    window.addEventListener("pageshow", onRestore);
    return () => window.removeEventListener("pageshow", onRestore);
  }, []);

  const submit = (event) => {
    event.preventDefault();
    if (going) return;
    setGoing(true);
    // Tell the page we are leaving on purpose, so it does not release the
    // seats we are about to pay for.
    onLeave?.();
    formRef.current?.submit();
  };

  return (
    <form ref={formRef} method="post" action={action} onSubmit={submit}>
      {/* Signed server-side: the hash covers every one of these, so editing
          an amount here makes CMI reject the payment outright. */}
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      <div className="rounded-2xl border border-line/60 bg-brume/40 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 shrink-0 text-lagon" aria-hidden />
          {t("cmiTitle")}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{t("cmiExplain")}</p>
      </div>

      <button
        type="submit"
        disabled={going}
        className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-safran text-sm font-semibold text-encre disabled:opacity-60"
      >
        {going ? (
          t("cmiGoing")
        ) : (
          <>
            <ExternalLink className="size-4 shrink-0" aria-hidden />
            {tf("cmiPayNow", { total: `${money(dueCents)} MAD` })}
          </>
        )}
      </button>

      <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-muted">
        <Lock className="size-3 shrink-0" aria-hidden />
        {t("cardSecure")}
      </p>
    </form>
  );
}
