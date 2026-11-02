/**
 * Boot guard for the URLs that leave this server.
 *
 * `PUBLIC_APP_URL` and `PUBLIC_API_URL` are not decoration: they are baked
 * into things that travel — the "Voir mon billet" button in an invitation
 * email, the PDF link beside it, and the `okUrl`/`failUrl` CMI redirects a
 * buyer lands on after paying. Left at their localhost defaults on a real
 * host, every one of those points at a machine the recipient does not have.
 *
 * The failure is silent and delayed, which is what makes it worth refusing
 * at boot. Nothing errors when the email is sent; the guest clicks days
 * later and gets nothing, and the first report of it is a confused buyer
 * rather than a stack trace.
 *
 * `CMI_CALLBACK_URL` is worse still. CMI calls it from its own servers to
 * confirm a payment, and that callback is the ONLY thing that issues a
 * ticket. A stale tunnel hostname there means the card is charged, the
 * callback goes nowhere, and no ticket is ever created — money taken for
 * nothing, with no error anywhere in this app.
 */

/** Hosts that cannot be reached from outside the machine running this. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

/**
 * Ephemeral tunnel providers.
 *
 * These hostnames are re-issued per session, so one captured in an .env is
 * dead the moment that tunnel restarts. Fine for a local CMI test session,
 * never right on a deployed host.
 */
const TUNNEL_HOSTS = [".trycloudflare.com", ".ngrok.io", ".ngrok-free.app", ".loca.lt", ".serveo.net"];

function describe(name: string, raw: string | undefined): string | null {
  if (!raw || !raw.trim()) return `${name} is unset`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `${name} is not a valid URL (${raw})`;
  }

  if (LOCAL_HOSTS.has(url.hostname)) return `${name} still points at ${url.hostname}`;
  const tunnel = TUNNEL_HOSTS.find((suffix) => url.hostname.endsWith(suffix));
  if (tunnel) return `${name} points at an ephemeral ${tunnel} tunnel, which expires`;
  if (url.protocol !== "https:") return `${name} is not https (${url.protocol}//)`;

  return null;
}

/**
 * Called at boot. Refuses to start a production server whose outward-facing
 * URLs would not work for the people who receive them.
 *
 * Deliberately production-only: every one of these values is *correct* as
 * localhost in development, and failing there would make the app unrunnable
 * for the thing it is for.
 */
export function assertPublicUrls(): void {
  if (process.env.NODE_ENV !== "production") return;

  const problems = [
    describe("PUBLIC_APP_URL", process.env.PUBLIC_APP_URL),
    describe("PUBLIC_API_URL", process.env.PUBLIC_API_URL),
    // Optional: with no value the code falls back to `${PUBLIC_API_URL}/api/
    // webhooks/cmi`, which is correct once that is a real host. Only a value
    // that IS set and wrong is a problem.
    process.env.CMI_CALLBACK_URL ? describe("CMI_CALLBACK_URL", process.env.CMI_CALLBACK_URL) : null,
  ].filter((problem): problem is string => problem !== null);

  if (problems.length === 0) return;

  throw new Error(
    [
      "Refusing to start: outward-facing URLs are not production values.",
      ...problems.map((problem) => `  - ${problem}`),
      "",
      "These are sent to buyers (ticket links, PDF links) and to CMI (payment",
      "redirects and the callback that issues a ticket). A wrong value here",
      "fails silently, days later, for someone else.",
    ].join("\n"),
  );
}
