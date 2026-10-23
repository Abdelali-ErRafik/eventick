/** Ticket reference format, matching the original frontend's
 * `ET-2026-${random}` convention from src/lib/store.ts. */
export function makeTicketRef(year: number): string {
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return `ET-${year}-${suffix}`;
}
