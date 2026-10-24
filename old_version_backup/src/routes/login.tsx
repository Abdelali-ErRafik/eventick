import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Shell } from "@/components/shell";
import { Button, Field } from "@/components/ui";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useI18n } from "@/lib/i18n";
import { emailOk } from "@/lib/payment";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

type Mode = "in" | "up";

function LoginPage() {
  const { t, tf } = useI18n();
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<Mode>("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signedIn = !isPending && user !== null && !user.isDevFallback;

  useEffect(() => {
    if (signedIn) void navigate({ to: "/" });
  }, [signedIn, navigate]);

  function authErrorMessage(err: unknown): string {
    const failure = err as { code?: unknown; status?: unknown } | null;
    const code = typeof failure?.code === "string" ? failure.code : "";
    const status = typeof failure?.status === "number" ? failure.status : 0;
    if (code.startsWith("INVALID_EMAIL_OR_PASSWORD") || status === 401) return t("loginFail");
    if (code.startsWith("USER_ALREADY_EXISTS") || status === 422) return t("emailInUse");
    return t("authError");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!emailOk(cleanEmail)) {
      setError(t("errEmail"));
      return;
    }
    if (password.length < 8) {
      setError(t("passwordHint"));
      return;
    }
    if (mode === "up" && name.trim().length < 2) {
      setError(t("errName"));
      return;
    }
    setBusy(mode);
    setError(null);
    try {
      if (mode === "up") {
        const { error: signUpError } = await authClient.signUp.email({
          name: name.trim(),
          email: cleanEmail,
          password,
        });
        if (signUpError) throw signUpError;
        toast.success(t("accountCreated"));
      } else {
        const { error: signInError } = await authClient.signIn.email({
          email: cleanEmail,
          password,
        });
        if (signInError) throw signInError;
        toast.success(t("welcomeBack"));
      }
      await navigate({ to: "/" });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function onSocial(providerId: string) {
    if (busy) return;
    setBusy(providerId);
    setError(null);
    try {
      await signIn(providerId, { callbackURL: "/", errorCallbackURL: "/login" });
    } catch (err) {
      setBusy(null);
      setError(
        err instanceof Error && /pop-?up/i.test(err.message) ? err.message : t("authError"),
      );
    }
  }

  if (signedIn) return null;

  return (
    <Shell>
      <div className="mx-auto w-full max-w-5xl px-4 py-10 md:px-8 md:py-14">
        <div className="grid overflow-hidden rounded-3xl border border-line/10 bg-card shadow-pop md:grid-cols-[1fr_1.1fr]">
          <aside className="hidden flex-col justify-between gap-8 bg-encre p-10 text-foam md:flex">
            <Link to="/" className="font-display text-xl font-extrabold tracking-tight">
              Eventick<span className="text-safran">.ma</span>
            </Link>
            <div>
              <p className="font-display text-display font-extrabold">
                {mode === "in" ? t("loginTitle") : t("signupTitle")}
              </p>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-mist">
                {mode === "in" ? t("loginSub") : t("signupSub")}
              </p>
            </div>
            <p className="flex items-center gap-2 text-xs font-semibold text-mist">
              <ShieldCheck className="size-4 shrink-0 text-safran" />
              {t("loginTrust")}
            </p>
          </aside>
          <div className="p-6 sm:p-8 md:p-10">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"
            >
              <ArrowLeft className="size-4 rtl:rotate-180" />
              {t("back")}
            </Link>
            <div className="mt-4 md:hidden">
              <h1 className="font-display text-2xl font-extrabold">
                {mode === "in" ? t("loginTitle") : t("signupTitle")}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {mode === "in" ? t("loginSub") : t("signupSub")}
              </p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-paper p-1 text-sm font-bold">
              {(["in", "up"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  disabled={busy !== null}
                  onClick={() => {
                    setMode(value);
                    setError(null);
                  }}
                  className={cn(
                    "h-11 rounded-full transition disabled:opacity-50",
                    mode === value ? "bg-card text-encre shadow-card" : "text-muted",
                  )}
                >
                  {value === "in" ? t("signIn") : t("signUp")}
                </button>
              ))}
            </div>
            <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
              {mode === "up" ? (
                <label className="grid gap-1.5 text-sm font-semibold">
                  {t("fullName")}
                  <Field
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    placeholder="Yasmine El Fassi"
                  />
                </label>
              ) : null}
              <label className="grid gap-1.5 text-sm font-semibold">
                {t("email")}
                <Field
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder={t("emailPh")}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                <span className="flex items-center justify-between gap-2">
                  {t("password")}
                  {mode === "up" ? (
                    <span className="text-xs font-medium text-muted">{t("passwordHint")}</span>
                  ) : null}
                </span>
                <span className="relative block">
                  <Field
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === "up" ? "new-password" : "current-password"}
                    className="pe-12"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? t("hidePwd") : t("showPwd")}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute end-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </span>
              </label>
              {error ? (
                <p role="alert" className="rounded-xl bg-corail/10 px-4 py-3 text-sm font-semibold text-corail">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={busy !== null} className="w-full">
                {busy === mode ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {mode === "in" ? t("waitConn") : t("waitCreate")}
                  </>
                ) : mode === "in" ? (
                  t("signIn")
                ) : (
                  t("signUp")
                )}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted">
              {mode === "in" ? t("noAccount") : t("haveAccount")}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "in" ? "up" : "in");
                  setError(null);
                }}
                className="font-bold text-lagon-deep underline-offset-4 hover:underline"
              >
                {mode === "in" ? t("signUp") : t("signIn")}
              </button>
            </p>
            <div className="my-6 flex items-center gap-3 text-sm font-semibold text-muted">
              <span className="h-px flex-1 bg-line/10" />
              {t("orContinue")}
              <span className="h-px flex-1 bg-line/10" />
            </div>
            <div className="grid gap-2">
              {GROK_PROVIDERS.map((provider) => (
                <button
                  key={provider.providerId}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void onSocial(provider.providerId)}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line/15 text-sm font-semibold transition hover:bg-paper disabled:opacity-50"
                >
                  {busy === provider.providerId ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {tf("continueWith", { p: provider.label })}
                </button>
              ))}
            </div>
            <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted md:hidden">
              <ShieldCheck className="size-4 shrink-0 text-lagon" />
              {t("loginTrust")}
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
