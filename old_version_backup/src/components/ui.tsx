import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "safran" | "ghost" | "dark" | "soft" | "foam";

const styles: Record<Variant, string> = {
  primary: "bg-lagon text-foam hover:bg-lagon-deep",
  safran: "bg-safran text-encre hover:bg-safran-deep",
  ghost: "border border-line/15 bg-transparent text-ink hover:bg-card",
  dark: "bg-encre text-foam hover:bg-night",
  soft: "bg-brume text-lagon-deep hover:bg-brume-deep",
  foam: "bg-card text-ink hover:bg-brume",
};

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Field(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("field", props.className)} />;
}

export function IconBubble({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-2xl bg-brume text-lagon",
        className,
      )}
    >
      {children}
    </span>
  );
}
