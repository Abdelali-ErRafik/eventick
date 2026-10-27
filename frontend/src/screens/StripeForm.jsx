import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Lock } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { money } from "../api";
import { useI18n } from "../i18n";
import { useTheme } from "../ThemeContext";

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
/**
 * Stripe renders its card field in an iframe, so it cannot inherit our CSS
 * custom properties — the palette has to be passed in as literal values.
 *
 * These were previously hardcoded to the light palette, so in dark mode the
 * card input was a bright white box sitting in a dark card: the one field on
 * the page where a buyer types their card number looked like it belonged to a
 * different site. Hence two explicit palettes, picked from the resolved theme.
 *
 * The hex values here are the only place in the app where a colour is not a
 * token, and they must stay in step with app/styles.css.
 */
const STRIPE_PALETTE = {
  light: {
    theme: "flat",
    variables: {
      colorPrimary: "#0B7A75",
      colorDanger: "#D6373D",
      colorBackground: "#FFFFFF",
      colorText: "#171A32",
      colorTextSecondary: "#3E4948",
      borderRadius: "12px",
      fontSizeBase: "15px",
    },
  },
  dark: {
    theme: "night",
    variables: {
      colorPrimary: "#3FD0C6",
      colorDanger: "#FF7B80",
      colorBackground: "#161931",
      colorText: "#E8ECF5",
      colorTextSecondary: "#A3AEC4",
      borderRadius: "12px",
      fontSizeBase: "15px",
    },
  },
};

export default function StripeForm({ publishableKey, clientSecret, dueCents, returnUrl, onError }) {
  const { locale } = useI18n();
  const { resolved } = useTheme();
  return (
    <Elements
      // Keyed on the theme: Stripe reads `appearance` when Elements mounts, so
      // without this a theme toggle would leave the old palette in the iframe.
      key={resolved}
      stripe={stripePromise(publishableKey)}
      options={{
        clientSecret,
        locale: locale === "ar" ? "ar" : "fr",
        appearance: STRIPE_PALETTE[resolved] ?? STRIPE_PALETTE.light,
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
