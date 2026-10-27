/**
 * Offline support for the gate.
 *
 * Two independent pieces:
 *  - a manifest of hashed valid refs, so the device can answer "is this one of
 *    ours?" with no network;
 *  - a queue of scans taken while offline, replayed when the network returns.
 *
 * The offline answer is deliberately weaker than the online one. It knows a
 * ticket was valid *when the manifest was downloaded*; it cannot know whether
 * another door admitted it since. Admitting locally and reconciling on replay
 * is the right trade at a gate — a queue that stops moving is worse than a
 * rare double-entry that the server reports afterwards.
 */

const MANIFEST_KEY = "eventick-gate-manifest";
const QUEUE_KEY = "eventick-gate-queue";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode). Offline support degrades to
    // "online only" rather than breaking the gate.
  }
}

export function saveManifest(manifest) {
  write(MANIFEST_KEY, { ...manifest, refs: manifest.refs });
}

export function loadManifest() {
  return read(MANIFEST_KEY, null);
}

export function clearManifest() {
  try {
    localStorage.removeItem(MANIFEST_KEY);
  } catch {
    // ignore
  }
}

/** Does this scanned ref appear in the downloaded manifest? */
export function manifestHas(manifest, ref) {
  return Boolean(manifest?.refs?.includes(ref));
}

/** Pull the bare ref out of a scanned QR payload, or return the input if it
 * was typed by hand. Mirrors the server's resolveScan, minus the signature
 * check, which needs the server key. */
export function refFromScan(raw) {
  const parts = String(raw).trim().split("|");
  if (parts.length === 4 && parts[0] === "EVENTICK") return parts[1];
  return String(raw).trim().toUpperCase();
}

export function queueScan(entry) {
  const queue = read(QUEUE_KEY, []);
  queue.push(entry);
  write(QUEUE_KEY, queue);
  return queue.length;
}

export function loadQueue() {
  return read(QUEUE_KEY, []);
}

export function clearQueue() {
  write(QUEUE_KEY, []);
}

/**
 * Replays queued scans. The server's check-in is already idempotent — a
 * second admission of the same ticket returns "used" rather than admitting
 * twice — so replaying a scan the device already sent is safe.
 *
 * Returns per-entry outcomes so the UI can show what the server actually made
 * of the offline decisions, including any it rejected.
 */
export async function flushQueue(post) {
  const queue = loadQueue();
  if (queue.length === 0) return { sent: 0, conflicts: [] };

  const conflicts = [];
  const remaining = [];

  for (const entry of queue) {
    try {
      await post(entry.payload);
    } catch (err) {
      // 4xx means the server has decided; keeping it queued would replay it
      // forever. Anything else (offline again, 5xx) stays for the next try.
      if (err?.status >= 400 && err.status < 500) {
        conflicts.push({ ...entry, reason: err.data?.result ?? "rejected" });
      } else {
        remaining.push(entry);
      }
    }
  }

  write(QUEUE_KEY, remaining);
  return { sent: queue.length - remaining.length, conflicts };
}
