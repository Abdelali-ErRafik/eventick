import { useId } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "../utils";

/**
 * A labelled form control.
 *
 * The buyer screens used to render `<label>{t("email")}<input/>{error}</label>`
 * by hand, which looks right but leaves the error text unassociated: a screen
 * reader announces the field as valid and never reads the message. Wiring
 * `aria-describedby` and `aria-invalid` here means every field in the app gets
 * it without a single call site remembering to.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  children,
  className,
  // Set when the control is not a single focusable input (a radio group,
  // a segmented control), so the label is not falsely tied to one element.
  asGroup = false,
}) {
  const id = useId();
  const controlId = `${id}-control`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const control =
    typeof children === "function"
      ? children({ id: controlId, describedBy, invalid: Boolean(error) })
      : children;

  const Wrapper = asGroup ? "fieldset" : "div";
  const Label = asGroup ? "legend" : "label";

  return (
    <Wrapper className={cn("min-w-0", className)} role={asGroup ? "group" : undefined}>
      <Label
        htmlFor={asGroup ? undefined : controlId}
        className="mb-1.5 block text-[13px] font-semibold text-ink"
      >
        {label}
        {required ? (
          <span className="ms-1 text-danger" aria-hidden>
            *
          </span>
        ) : null}
      </Label>

      {control}

      {error ? (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-[13px] font-medium text-danger" role="alert">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </Wrapper>
  );
}

const CONTROL_BASE =
  "block w-full rounded-xl border bg-card px-4 text-ink outline-none transition " +
  "duration-150 placeholder:text-mist disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60";

function controlClass(invalid, className) {
  return cn(
    CONTROL_BASE,
    invalid
      ? "border-danger focus:border-danger focus:ring-[3px] focus:ring-danger/20"
      : "border-line/15 focus:border-primary focus:ring-[3px] focus:ring-primary/20",
    className,
  );
}

export function Input({ id, describedBy, invalid, className, ...rest }) {
  return (
    <input
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={controlClass(invalid, cn("h-11", className))}
      {...rest}
    />
  );
}

export function Textarea({ id, describedBy, invalid, className, ...rest }) {
  return (
    <textarea
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className={controlClass(invalid, cn("min-h-28 resize-y py-3", className))}
      {...rest}
    />
  );
}

export function Select({ id, describedBy, invalid, className, children, ...rest }) {
  return (
    <select
      id={id}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      // pe-10 leaves room for the native arrow in both directions; the
      // browser mirrors it under RTL on its own.
      className={controlClass(invalid, cn("h-11 pe-10", className))}
      {...rest}
    >
      {children}
    </select>
  );
}
