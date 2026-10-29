// Promise-based confirm, replacing window.confirm for destructive dashboard
// actions: `if (!(await confirm({ message, tone: "danger" }))) return;`
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle, Trash2 } from "lucide-react";
import { Btn } from "./ui";
import { cn } from "../../utils";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    setState(options);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = (result) => {
    setState(null);
    resolverRef.current?.(result);
    resolverRef.current = null;
  };

  /*
   * Escape answers THIS dialog, and nothing behind it.
   *
   * The confirm overlay is a sibling of the page, not a child of whatever
   * opened it, so a confirm raised from inside an open Modal (the
   * cancel-event flow does exactly this) leaves both mounted at once. Both
   * listen for Escape on `document`, and same-node capture listeners fire in
   * REGISTRATION order — the modal's is always first, so stopPropagation
   * here could never hold it back. Modal instead checks
   * `document.body.dataset.confirming` and ignores Escape while it is set,
   * which is what this flag is for.
   *
   * Escape resolves false: backing out of a destructive confirm must never
   * be the thing that performs it.
   */
  useEffect(() => {
    if (!state) return;
    document.body.dataset.confirming = "1";
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      delete document.body.dataset.confirming;
    };
    // `close` only touches refs and the setter, so it needs no dep entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const tone = state?.tone ?? "default";
  const Icon = tone === "danger" ? Trash2 : tone === "warn" ? AlertTriangle : HelpCircle;
  const iconTone = {
    default: "bg-brume text-primary",
    warn: "bg-accent/20 text-accent",
    danger: "bg-danger/12 text-danger",
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-stage/50 p-5 backdrop-blur-[2px]"
          onClick={() => close(false)}
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[400px] rounded-panel bg-card px-6 pb-6 pt-7 text-center shadow-modal"
          >
            <div className={cn("mx-auto mb-3.5 flex size-14 items-center justify-center rounded-control", iconTone[tone])} aria-hidden>
              <Icon className="size-6" />
            </div>
            <h3 className="mb-2 font-display text-[19px] font-extrabold tracking-tight">{state.title}</h3>
            {state.message ? <p className="mx-auto mb-6 max-w-[320px] text-sm leading-relaxed text-muted">{state.message}</p> : null}
            <div className="flex gap-2.5">
              <Btn variant="secondary" className="flex-1" onClick={() => close(false)}>
                {state.cancelLabel}
              </Btn>
              <Btn variant={tone === "danger" ? "danger" : "primary"} className="flex-1" onClick={() => close(true)}>
                {state.confirmLabel}
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
