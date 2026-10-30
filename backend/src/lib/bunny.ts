import { logger } from "./logger.js";

/**
 * Bunny.net image storage.
 *
 * Bytes are PUT into the storage zone over the Storage API and read back by
 * the browser from the pull zone's CDN hostname. The API never serves an image
 * itself, which is the whole point: a poster is static, public and requested
 * once per page view, so putting it on a CDN edge takes that traffic off the
 * API entirely and survives a redeploy — unlike ./storage/uploads, which a
 * container wipes.
 *
 * With no BUNNY_STORAGE_KEY the module reports itself unconfigured and the
 * upload route falls back to local disk, so the flow still works offline and
 * in tests without credentials.
 */

/** Region subdomain. Empty/unset = Falkenstein (the default region), whose
 * endpoint has no prefix — "storage.bunnycdn.com", not ".storage...". */
function endpoint(): string {
  const region = (process.env.BUNNY_STORAGE_REGION ?? "").trim();
  return region ? `https://${region}.storage.bunnycdn.com` : "https://storage.bunnycdn.com";
}

export function bunnyConfigured(): boolean {
  return Boolean(process.env.BUNNY_STORAGE_KEY && process.env.BUNNY_STORAGE_ZONE && process.env.BUNNY_CDN_URL);
}

/** The public URL a stored object is served from. */
function publicUrl(name: string): string {
  // The env value is a bare hostname ("storeno.b-cdn.net"), but tolerate a
  // scheme being pasted in rather than producing "https://https://...".
  const host = (process.env.BUNNY_CDN_URL ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${host}/${name}`;
}

/**
 * Store one image and return its CDN URL.
 *
 * Throws on failure rather than returning a sentinel: unlike an email, an
 * upload has nothing useful to return if the bytes did not land — the caller
 * would otherwise hand back a URL that 404s forever.
 */
export async function uploadToBunny(name: string, body: Buffer, contentType: string): Promise<string> {
  const zone = process.env.BUNNY_STORAGE_ZONE!;
  const key = process.env.BUNNY_STORAGE_KEY!;
  const path = `events/${name}`;

  const res = await fetch(`${endpoint()}/${zone}/${path}`, {
    method: "PUT",
    headers: {
      AccessKey: key,
      "Content-Type": contentType,
    },
    body: new Uint8Array(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.warn({ status: res.status, detail: detail.slice(0, 200) }, "bunny upload failed");
    throw new Error(`Bunny upload failed (${res.status})`);
  }

  return publicUrl(path);
}

/**
 * Remove a stored object. Best-effort: a poster that outlives its event costs
 * pennies, so a failed delete is logged and swallowed rather than failing the
 * request that triggered it.
 */
export async function deleteFromBunny(url: string): Promise<void> {
  if (!bunnyConfigured()) return;
  const host = (process.env.BUNNY_CDN_URL ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!url.includes(host)) return; // not ours — a seeded /events/*.jpg path, say
  const path = url.split(`${host}/`)[1];
  if (!path) return;

  try {
    const res = await fetch(`${endpoint()}/${process.env.BUNNY_STORAGE_ZONE}/${path}`, {
      method: "DELETE",
      headers: { AccessKey: process.env.BUNNY_STORAGE_KEY! },
    });
    if (!res.ok) logger.warn({ status: res.status, path }, "bunny delete failed");
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "bunny delete threw");
  }
}
