import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./Button";
import { cn } from "../utils";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog.
 *
 * Replaces four separate implementations that had drifted apart. The worst of
 * them (the ticket-transfer sheet) had no `role`, no Escape handler and no
 * focus management at all: keyboard users tabbed straight out of the dialog
 * into the page behind it, and screen readers never announced it opening.
 *
 * What this guarantees, so no call site has to: focus moves in on open and
 * returns to the trigger on close, Tab is trapped, Escape closes, the page
 * behind cannot scroll, and the title is the dialog's accessible name.
 */
export function Modal({ open, onClose, title, sub, icon, children, footer, size = "md" }) {
  const boxRef = useRef(null);
  const previouslyFocused = useRef(null);
  const id = useId();
  const titleId = `${id}-title`;
  const subId = sub ? `${id}-sub` : undefined;

  /**
   * The latest onClose, without the effect depending on its identity.
   *
   * Every call site writes `onClose={() => setOpen(false)}` — a NEW function
   * on every render. With onClose in the effect's dependency array, the whole
   * open-effect tore down and re-ran on each keystroke, and its last act is
   * `target.focus()` on the first focusable element. So typing one character
   * into any field inside a Modal moved focus to the close button and dropped
   * the next character. A ref is the fix that does not require 20 call sites
   * to remember useCallback.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const trapTab = useCallback((event) => {
    if (event.key !== "Tab") return;
    const nodes = boxRef.current?.querySelectorAll(FOCUSABLE);
    if (!nodes?.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    // Wrap around rather than letting focus escape to the page behind.
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement;

    const onKey = (event) => {
      if (event.key === "Escape") {
        // A confirm dialog opened from inside this modal sits ABOVE it as a
        // sibling overlay, and this listener would otherwise answer its
        // Escape — closing the modal out from under the dialog, which then
        // floats over nothing while focus jumps to the page behind. Both
        // listeners are on `document`, and same-node capture listeners fire
        // in registration order, so the dialog cannot win by stopping
        // propagation; it raises this flag instead and we stand down.
        if (document.body.dataset.confirming) return;
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      trapTab(event);
    };

    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Prefer the first real control; fall back to the box so focus is never
    // left on the page behind.
    const target = boxRef.current?.querySelector(FOCUSABLE) ?? boxRef.current;
    target?.focus();

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      // Returning focus is what makes a dialog feel like it belongs to the
      // button that opened it.
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
    // onClose deliberately absent: it is read through onCloseRef, so a new
    // inline arrow from the parent no longer re-runs focus management.
  }, [open, trapTab]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const widths = { sm: "max-w-[420px]", md: "max-w-[520px]", lg: "max-w-[680px]" };

  return createPortal(
    <div
      // A scrim must always dim the page toward black, in either theme —
      // bg-encre (the ink/text colour) is near-white in dark mode, which
      // would wash a dark page toward light instead of dimming it.
      className="fixed inset-0 z-[120] flex items-end justify-center bg-stage/50 p-0 backdrop-blur-[3px] sm:items-center sm:p-5"
      onMouseDown={(event) => {
        // Only a press that starts on the backdrop dismisses — otherwise a
        // text selection that ends outside closes the dialog mid-edit.
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={boxRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subId}
        className={cn(
          "flex max-h-[92vh] w-full flex-col overflow-hidden bg-card shadow-modal outline-none",
          // A bottom sheet on phones, a centred dialog from sm up.
          "rounded-t-panel sm:rounded-panel",
          widths[size],
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/10 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon ? (
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-brume text-primary" aria-hidden>
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-heading font-extrabold">
                {title}
              </h2>
              {sub ? (
                <p id={subId} className="mt-0.5 text-[13px] text-muted">
                  {sub}
                </p>
              ) : null}
            </div>
          </div>
          <IconButton label={typeof title === "string" ? `Fermer — ${title}` : "Fermer"} tone="danger" size="sm" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2.5 border-t border-line/10 bg-paper px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
