// Client-side mirror of backend/src/lib/payment-sim.ts — lets Checkout show
// inline validation errors before submit instead of only finding out after
// the 3-D Secure step that the card number was wrong. The real backend
// re-validates everything server-side regardless; this is UX only.

export function digitsOnly(value) {
  return value.replace(/\D/g, "");
}

export function formatCard(value) {
  return digitsOnly(value).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export function formatExp(value) {
  const d = digitsOnly(value).slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)} / ${d.slice(2)}`;
}

export function luhnOk(value) {
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

export function expOk(value, today = new Date()) {
  const d = digitsOnly(value);
  if (d.length !== 4) return false;
  const month = Number(d.slice(0, 2));
  const year = 2000 + Number(d.slice(2));
  if (month < 1 || month > 12) return false;
  const exp = year * 12 + month;
  const now = today.getFullYear() * 12 + (today.getMonth() + 1);
  return exp >= now;
}

export function phoneOk(value) {
  const d = digitsOnly(value);
  if (d.startsWith("212") && d.length === 12) return /^212[5-7]\d{8}$/.test(d);
  if (d.length === 10) return /^0[5-7]\d{8}$/.test(d);
  return false;
}

export function emailOk(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export const DEMO_PAN = "4242424242424242";
export const DEMO_3DS = "482913";
