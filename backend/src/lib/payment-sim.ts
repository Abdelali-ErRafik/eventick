// Simulated payment — the MOCK mode fallback used when CMI is not
// configured (no CMI_CLIENT_ID/CMI_STORE_KEY), so the whole funnel stays
// demoable and testable offline. With CMI configured none of this runs: the
// card is collected on CMI's hosted page and the outcome arrives by callback.
//
// The card helpers below are kept for the demo card contract the original
// TanStack Start app shipped; CMI validates real cards itself.

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

export function luhnOk(value: string) {
  const s = digitsOnly(value);
  if (s.length !== 16) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let n = Number(s[15 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export function cardBrand(value: string): "visa" | "mastercard" | "unknown" {
  const s = digitsOnly(value);
  if (s.startsWith("4")) return "visa";
  if (/^5[1-5]/.test(s) || /^2(2|3|4|5|6|7)/.test(s)) return "mastercard";
  return "unknown";
}

export function expOk(value: string, today = new Date()) {
  const d = digitsOnly(value);
  if (d.length !== 4) return false;
  const month = Number(d.slice(0, 2));
  const year = 2000 + Number(d.slice(2));
  if (month < 1 || month > 12) return false;
  const exp = year * 12 + month;
  const now = today.getFullYear() * 12 + (today.getMonth() + 1);
  return exp >= now;
}

export function bankFromNumber(value: string) {
  const s = digitsOnly(value);
  if (s.startsWith("4242")) return "CMI Démo";
  if (s.startsWith("4")) return "Visa · banque émettrice";
  if (s.startsWith("5")) return "Mastercard · banque émettrice";
  return "Centre Monétique Interbancaire";
}

export const DEMO_PAN = "4242424242424242";
export const DEMO_3DS = "482913";

export function phoneOk(value: string) {
  const d = digitsOnly(value);
  if (d.startsWith("212") && d.length === 12) return /^212[5-7]\d{8}$/.test(d);
  if (d.length === 10) return /^0[5-7]\d{8}$/.test(d);
  return false;
}

export function makePaymentRef() {
  return `AUTH-${Math.floor(1000000 + Math.random() * 9000000)}`;
}
