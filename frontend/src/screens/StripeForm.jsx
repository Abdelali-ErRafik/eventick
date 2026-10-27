import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Lock } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { money } from "../api";
import { useI18n } from "../i18n";

// loadStripe is cached per key: calling it repeatedly would refetch Stripe.js.
const cache = new Map();
function stripePromise(key) {
  if (!cache.has(key)) cache.set(key, loadStripe(key));
  return cache.get(key);
}

/**
 * Stripe payment step. The card is collected by Stripe's own iframe and
 * confirmed directly with Stripe — the number never reaches our server, and
 * 3-D Secure is Stripe's challenge, not a code we invent.
 */
export default function StripeForm({ publishableKey, clientSecret, dueCents, returnUrl, onError }) {
  const { locale } = useI18n();
  return (
    <Elements
      stripe={stripePromise(publishableKey)}
      options={{
        clientSecret,
        locale: locale === "ar" ? "ar" : "fr",
        appearance: {
          theme: "flat",
          variables: { colorPrimary: "#0B7A75", colorDanger: "#D6373D", borderRadius: "12px", fontSizeBase: "15px" },
        },
      }}
    >
      <PayBody dueCents={dueCents} returnUrl={returnUrl} onError={onError} />
    </Elements>
  );
}

function PayBody({ dueCents, returnUrl, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const { t, tf } = useI18n();
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      // Stay on the page unless the card needs a redirect-based challenge.
      redirect: "if_required",
    });
    if (result.error) {
      setBusy(false);
      onError(result.error.message ?? t("payFail"));
      return;
    }
    // Succeeded without a redirect; the webhook issues the tickets.
    window.location.assign(returnUrl);
  };

  return (
    <form onSubmit={submit}>
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || busy}
        className="mt-5 h-14 w-full rounded-full bg-safran text-sm font-semibold text-encre disabled:opacity-60"
      >
        {busy ? t("processing") : tf("payNow", { total: `${money(dueCents)} MAD` })}
      </button>
      <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-muted">
        <Lock className="size-3 shrink-0" />
        {t("cardSecure")}
      </p>
    </form>
  );
}
