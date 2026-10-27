import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../utils";

/**
 * A button that opens a panel anchored to it.
 *
 * The public header had three of these written by hand — the city picker, the
 * search panel and the account controls — and **none** of them handled Escape
 * or an outside click. Opening the city list and clicking anywhere else left
 * it hanging over the page until you clicked the trigger again.
 *
 * Doing it once here means every popover in the app dismisses the way people
 * expect, and the trigger/panel relationship is announced properly.
 */
export function Popover({ label, trigger, align = "start", width = "w-56", children, className, panelClassName }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;

    const onKey = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Focus goes back to the trigger, not to the top of the page.
      triggerRef.current?.focus();
    };
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((prev) => !prev)}
      >
        {typeof trigger === "function" ? trigger({ open }) : trigger}
      </button>

      {open ? (
        <div
          id={id}
          className={cn(
            "absolute top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-panel border border-line/10 bg-card text-ink shadow-modal",
            align === "end" ? "end-0" : "start-0",
            width,
            panelClassName,
          )}
        >
          {typeof children === "function" ? children({ close }) : children}
        </div>
      ) : null}
    </div>
  );
}

/** A row inside a Popover panel. */
export function PopoverItem({ as: As = "button", className, children, ...rest }) {
  return (
    <As
      className={cn(
        "flex w-full items-center gap-2.5 px-4 py-2.5 text-start text-sm font-semibold text-ink transition hover:bg-paper",
        className,
      )}
      {...(As === "button" ? { type: "button" } : null)}
      {...rest}
    >
      {children}
    </As>
  );
}
