import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Shell } from "../components/Shell";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { useI18n } from "../i18n";
import { Button, Card, Container, Field, Input, Textarea } from "../ui";

/**
 * Applying to become an organiser.
 *
 * "Créer un événement" — the brand-coloured button in the header and the
 * primary CTA on the home page — used to point straight at /organiser, which
 * is guarded on events.manage. So the most prominent call to action on the
 * site was a dead end: a logged-out visitor got bounced to /login with no
 * mention of organisers, and a logged-in customer was redirected to the
 * homepage with no explanation at all. This is where it points now.
 */
export default function BecomeOrganiser() {
  const { t } = useI18n();
  const { user, canUsePro, refresh } = useAuth();
  const navigate = useNavigate();

  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ displayName: "", phone: "", pitch: "" });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    api
      .get("/organiser-applications/mine")
      .then((data) => setApplication(data.application))
      .catch(() => setApplication(null))
      .finally(() => setLoading(false));
  }, [user]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;

    // Mirrors the server's schema so the message lands on the field rather
    // than arriving as a toast that does not say which input is wrong.
    const next = {};
    if (form.displayName.trim().length < 2) next.displayName = t("required");
    if (form.phone.trim().length < 6) next.phone = t("errPhone");
    if (form.pitch.trim().length < 20) next.pitch = t("applyPitchHint");
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const data = await api.post("/organiser-applications", {
        displayName: form.displayName.trim(),
        phone: form.phone.trim(),
        pitch: form.pitch.trim(),
      });
      setApplication(data.application);
      toast.success(t("applySent"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Already an organiser: nothing to apply for. Offer the dashboard instead
  // of a form that would only 409.
  if (canUsePro) {
    return (
      <Shell>
        <Container size="form" className="py-16">
          <Card className="text-center">
            <p className="text-sm text-muted">{t("becomeAlready")}</p>
            <Button className="mt-4" icon={<ArrowRight className="size-4" />} onClick={() => navigate("/pro")}>
              {t("applyOpenPro")}
            </Button>
          </Card>
        </Container>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Same dark stage treatment as the other moments that matter — the
          confirmation hero, EventDetail's header. */}
      <section className="bg-stage py-12 text-stage-fg md:py-16">
        <Container size="form" className="text-center">
          <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-fg">
            <Sparkles className="size-7" />
          </span>
          <h1 className="mt-5 font-display text-3xl font-extrabold md:text-4xl">{t("becomeTitle")}</h1>
          <p className="mx-auto mt-3 max-w-xl text-stage-muted">{t("becomeBody")}</p>
        </Container>
      </section>

      <Container size="form" className="py-8 md:py-10">
        {!user ? (
          <Card className="text-center">
            <p className="text-sm text-muted">{t("becomeSignedOut")}</p>
            <Button className="mt-4" onClick={() => navigate("/login")}>
              {t("signIn")}
            </Button>
          </Card>
        ) : loading ? (
          <div className="h-56 animate-pulse rounded-card bg-card" />
        ) : application?.status === "PENDING" ? (
          <StatusCard
            tone="warn"
            icon={<Clock className="size-6" />}
            title={t("applyPendingTitle")}
            body={t("applyPendingBody")}
          />
        ) : application?.status === "APPROVED" ? (
          <StatusCard
            tone="success"
            icon={<CheckCircle2 className="size-6" />}
            title={t("applyApprovedTitle")}
            body={t("applyApprovedBody")}
            action={
              <Button
                className="mt-4"
                icon={<ArrowRight className="size-4" />}
                // The role changed server-side while this page was open, so
                // the session has to re-read /auth/me before /pro will let
                // them in — its guard reads the permission list.
                onClick={async () => {
                  await refresh();
                  navigate("/pro");
                }}
              >
                {t("applyOpenPro")}
              </Button>
            }
          />
        ) : (
          <>
            {application?.status === "DECLINED" ? (
              <StatusCard
                tone="danger"
                icon={<XCircle className="size-6" />}
                title={t("applyDeclinedTitle")}
                body={t("applyDeclinedBody")}
                note={application.decisionNote ? `${t("applyReason")} — ${application.decisionNote}` : null}
                className="mb-4"
              />
            ) : null}

            <Card>
              <form className="grid gap-4" onSubmit={submit}>
                <Field label={t("applyDisplayName")} required error={errors.displayName} hint={t("applyDisplayNameHint")}>
                  {({ id, describedBy, invalid, required }) => (
                    <Input
                      id={id}
                      describedBy={describedBy}
                      invalid={invalid}
                      required={required}
                      value={form.displayName}
                      onChange={set("displayName")}
                      autoComplete="organization"
                    />
                  )}
                </Field>

                <Field label={t("applyPhone")} required error={errors.phone} hint={t("applyPhoneHint")}>
                  {({ id, describedBy, invalid, required }) => (
                    <Input
                      id={id}
                      describedBy={describedBy}
                      invalid={invalid}
                      required={required}
                      type="tel"
                      value={form.phone}
                      onChange={set("phone")}
                      autoComplete="tel"
                      placeholder="0612345678"
                    />
                  )}
                </Field>

                <Field label={t("applyPitch")} required error={errors.pitch} hint={t("applyPitchHint")}>
                  {({ id, describedBy, invalid, required }) => (
                    <Textarea
                      id={id}
                      describedBy={describedBy}
                      invalid={invalid}
                      required={required}
                      value={form.pitch}
                      onChange={set("pitch")}
                      maxLength={1000}
                    />
                  )}
                </Field>

                <div>
                  <Button type="submit" loading={busy}>
                    {application?.status === "DECLINED" ? t("applyAgain") : t("applySend")}
                  </Button>
                </div>
              </form>
            </Card>
          </>
        )}
      </Container>
    </Shell>
  );
}

function StatusCard({ tone, icon, title, body, note, action, className }) {
  const tones = {
    warn: "bg-warn-bg text-warn",
    success: "bg-success-bg text-success",
    danger: "bg-danger-bg text-danger",
  };
  return (
    <Card className={className}>
      <div className="flex items-start gap-4">
        <span className={`inline-flex size-12 shrink-0 items-center justify-center rounded-card ${tones[tone]}`} aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-bold">{title}</p>
          <p className="mt-1 text-sm text-muted">{body}</p>
          {note ? <p className="mt-2 text-sm text-ink">{note}</p> : null}
          {action}
        </div>
      </div>
    </Card>
  );
}
