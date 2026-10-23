export type PromoCandidate = {
  id: string;
  code: string;
  kind: "PERCENT" | "AMOUNT";
  value: number;
  eventId: string | null;
  maxUses: number;
  uses: number;
};

/** Ported from the frontend's quotePromo in src/lib/store.ts — same rules:
 * case-insensitive match, usage cap, event-scoping, discount clamped to the
 * subtotal so a promo can never make a total negative. */
export function quotePromo(
  promos: PromoCandidate[],
  code: string,
  eventId: string,
  subtotalCents: number,
): { promo: PromoCandidate; discountCents: number } | null {
  const needle = code.trim().toLowerCase();
  if (!needle || subtotalCents <= 0) return null;

  const promo = promos.find(
    (item) =>
      item.code.toLowerCase() === needle &&
      item.uses < item.maxUses &&
      (item.eventId === null || item.eventId === eventId),
  );
  if (!promo || promo.value <= 0) return null;

  const raw =
    promo.kind === "PERCENT"
      ? Math.round((subtotalCents * Math.min(promo.value, 100)) / 100)
      : promo.value;
  const discountCents = Math.min(subtotalCents, Math.max(0, raw));
  if (discountCents <= 0) return null;

  return { promo, discountCents };
}
