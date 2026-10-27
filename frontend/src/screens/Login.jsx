import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "../components/Shell";
import { useAuth } from "../AuthContext";
import { useI18n } from "../i18n";
import { emailOk } from "../payment";
import { cn } from "../utils";
import { DEMO_ACCOUNTS } from "../demoAccounts";

const SHOW_DEMO_ACCOUNTS = process.env.NODE_ENV !== "production";

export default function Login() {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const { user, loading, login, register } = useAuth();
  const [mode, setMode] = useState("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!loading && user) navigate("/");
  }, [loading, user, navigate]);

  function authErrorMessage(err) {
    if (err?.status === 401) return t("loginFail");
    if (err?.status === 422) return t("emailInUse");
    return t("authError");
  }

  async function onSubmit(e) {
    e.preventDefault();
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
    setBusy(true);
    setError(null);
    try {
      if (mode === "up") {
        await register(name.trim(), cleanEmail, password);
        toast.success(t("accountCreated"));
      } else {
        await login(cleanEmail, password);
        toast.success(t("welcomeBack"));
      }
      navigate("/");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function quickLogin(account) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(account.email, account.password);
      toast.success(t("welcomeBack"));
      navigate("/");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!loading && user) return null;

  return (
    <Shell>
      <div className="mx-auto w-full max-w-5xl px-4 py-10 md:px-8 md:py-14">
        <div className="grid overflow-hidden rounded-3xl border border-line/10 bg-card shadow-pop md:grid-cols-[1fr_1.1fr]">
          <aside className="hidden flex-col justify-between gap-8 bg-encre p-10 text-foam md:flex">
            <Link to="/" className="font-display text-xl font-extrabold tracking-tight">
              Eventick<span className="text-accent">.ma</span>
            </Link>
            <div>
              <p className="font-display text-display font-extrabold">{mode === "in" ? t("loginTitle") : t("signupTitle")}</p>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-mist">{mode === "in" ? t("loginSub") : t("signupSub")}</p>
            </div>
            <p className="flex items-center gap-2 text-xs font-semibold text-mist">
              <ShieldCheck className="size-4 shrink-0 text-accent" />
              {t("loginTrust")}
            </p>
          </aside>
          <div className="p-6 sm:p-8 md:p-10">
            <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
              <ArrowLeft className="size-4 rtl:rotate-180" />
              {t("back")}
            </Link>
            <div className="mt-4 md:hidden">
              <h1 className="font-display text-2xl font-extrabold">{mode === "in" ? t("loginTitle") : t("signupTitle")}</h1>
              <p className="mt-1 text-sm text-muted">{mode === "in" ? t("loginSub") : t("signupSub")}</p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-paper p-1 text-sm font-bold">
              {["in", "up"].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  disabled={busy}
                  onClick={() => {
                    setMode(value);
                    setError(null);
                  }}
                  className={cn("h-11 rounded-full transition disabled:opacity-50", mode === value ? "bg-card text-ink shadow-card" : "text-muted hover:text-ink")}
                >
                  {value === "in" ? t("signIn") : t("signUp")}
                </button>
              ))}
            </div>
            <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
              {mode === "up" ? (
                <label className="grid gap-1.5 text-sm font-semibold">
                  {t("fullName")}
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Yasmine El Fassi" />
                </label>
              ) : null}
              <label className="grid gap-1.5 text-sm font-semibold">
                {t("email")}
                <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder={t("emailPh")} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                <span className="flex items-center justify-between gap-2">
                  {t("password")}
                  {mode === "up" ? <span className="text-xs font-medium text-muted">{t("passwordHint")}</span> : null}
                </span>
                <span className="relative block">
                  <input
                    className="field pe-12"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "up" ? "new-password" : "current-password"}
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
                <p role="alert" className="rounded-card bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
                  {error}
                </p>
              ) : null}
              <button type="submit" disabled={busy} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-fg transition hover:bg-primary-hover disabled:opacity-50">
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {mode === "in" ? t("waitConn") : t("waitCreate")}
                  </>
                ) : mode === "in" ? (
                  t("signIn")
                ) : (
                  t("signUp")
                )}
              </button>
            </form>
            <p className="mt-4 text-center text-sm text-muted">
              {mode === "in" ? t("noAccount") : t("haveAccount")}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "in" ? "up" : "in");
                  setError(null);
                }}
                className="font-bold text-primary underline-offset-4 hover:underline"
              >
                {mode === "in" ? t("signUp") : t("signIn")}
              </button>
            </p>
            {SHOW_DEMO_ACCOUNTS ? (
              <div className="mt-6">
                <p className="flex items-center gap-3 text-center text-xs font-semibold text-muted">
                  <span className="h-px flex-1 bg-line/15" />
                  {t("demoAccounts")}
                  <span className="h-px flex-1 bg-line/15" />
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      disabled={busy}
                      onClick={() => quickLogin(account)}
                      className="rounded-control border border-line/15 px-3 py-2.5 text-start transition hover:border-primary/40 hover:bg-paper disabled:opacity-50"
                    >
                      <span className="block text-sm font-bold text-encre">{locale === "ar" ? account.labelAr : account.labelFr}</span>
                      <span className="block text-xs text-muted">{locale === "ar" ? account.roleAr : account.roleFr}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted md:hidden">
              <ShieldCheck className="size-4 shrink-0 text-primary" />
              {t("loginTrust")}
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
