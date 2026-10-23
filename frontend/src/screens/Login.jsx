import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shell } from "../components/Shell";
import { useAuth } from "../AuthContext";
import { useI18n } from "../i18n";

export default function Login() {
  const { t } = useI18n();
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "up") await register(name, email, password);
      else await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="mx-auto max-w-md px-4 py-12">
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-paper p-1 text-sm font-bold">
          <button type="button" onClick={() => setMode("in")} className={`h-11 rounded-full ${mode === "in" ? "bg-card shadow-card" : ""}`}>
            {t("signIn")}
          </button>
          <button type="button" onClick={() => setMode("up")} className={`h-11 rounded-full ${mode === "up" ? "bg-card shadow-card" : ""}`}>
            {t("signUp")}
          </button>
        </div>

        <form onSubmit={submit} className="grid gap-4">
          {mode === "up" ? (
            <Field label={t("fullName")} value={name} onChange={setName} />
          ) : null}
          <Field label={t("email")} type="email" value={email} onChange={setEmail} />
          <Field label={t("password")} type="password" value={password} onChange={setPassword} />
          {error ? <p className="rounded-lg bg-corail/10 px-4 py-3 text-sm text-corail">{error}</p> : null}
          <button type="submit" disabled={busy} className="h-12 rounded-full bg-safran font-semibold text-encre disabled:opacity-50">
            {busy ? "..." : mode === "in" ? t("signIn") : t("signUp")}
          </button>
        </form>
      </div>
    </Shell>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-lg border border-line/15 px-4 font-normal"
      />
    </label>
  );
}
