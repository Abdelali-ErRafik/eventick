const TOKEN_KEY = "eventick_token";
export const UNAUTHORIZED_EVENT = "eventick:unauthorized";

/**
 * Order access tokens — the credential a guest buyer has instead of a session.
 *
 * A guest order is not tied to a user, so the server cannot identify the buyer
 * from a login. Instead the hold that creates the order returns a secret, and
 * presenting it is what proves "this order is mine". Without it the order id
 * alone would be the credential, and ids are not secrets.
 *
 * Kept per order rather than as one current value: a buyer can hold tickets
 * from several orders, and opening an older confirmation link must not lose
 * access to the newer one. Survives a reload, because the confirmation page is
 * exactly what people revisit.
 */
const ORDER_KEYS = "eventick_order_keys";

function readOrderKeys() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(ORDER_KEYS) ?? "{}");
  } catch {
    return {};
  }
}

export function rememberOrderKey(orderId, accessToken) {
  if (typeof window === "undefined" || !orderId || !accessToken) return;
  try {
    localStorage.setItem(ORDER_KEYS, JSON.stringify({ ...readOrderKeys(), [orderId]: accessToken }));
  } catch {
    // A full or blocked store is not fatal: the token also travels in the
    // confirmation URL, which is how a buyer on another device gets in.
  }
}

export function getOrderKey(orderId) {
  if (!orderId) return null;
  return readOrderKeys()[orderId] ?? null;
}

/** Tickets are reached by ticket id, not order id, so the screen that opens
 * one remembers which order it came from. */
export function rememberTicketOrder(ticketId, orderId) {
  if (typeof window === "undefined" || !ticketId || !orderId) return;
  try {
    const map = JSON.parse(localStorage.getItem(`${ORDER_KEYS}_tickets`) ?? "{}");
    localStorage.setItem(`${ORDER_KEYS}_tickets`, JSON.stringify({ ...map, [ticketId]: orderId }));
  } catch {
    /* non-fatal, see above */
  }
}

export function getTicketOrderKey(ticketId) {
  if (typeof window === "undefined" || !ticketId) return null;
  try {
    const map = JSON.parse(localStorage.getItem(`${ORDER_KEYS}_tickets`) ?? "{}");
    return getOrderKey(map[ticketId]);
  } catch {
    return null;
  }
}

/**
 * A credential for ONE ticket, as issued when someone claims a share.
 *
 * The claimed ticket sits on the sender's order, so the recipient has no order
 * token and must not be given one — it would open the sender's other tickets
 * too. This is narrower by design.
 */
const TICKET_KEYS = "eventick_ticket_keys";

export function rememberTicketKey(ticketId, accessToken) {
  if (typeof window === "undefined" || !ticketId || !accessToken) return;
  try {
    const map = JSON.parse(localStorage.getItem(TICKET_KEYS) ?? "{}");
    localStorage.setItem(TICKET_KEYS, JSON.stringify({ ...map, [ticketId]: accessToken }));
  } catch {
    /* non-fatal: the token also travels in the /billet link */
  }
}

export function getTicketKey(ticketId) {
  if (typeof window === "undefined" || !ticketId) return null;
  try {
    return JSON.parse(localStorage.getItem(TICKET_KEYS) ?? "{}")[ticketId] ?? null;
  } catch {
    return null;
  }
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * The order token this path needs, if any.
 *
 * Attached here rather than at each call site: there are eight places that
 * touch an order or a ticket, and one of them forgetting would be a guest
 * buyer locked out of their own ticket with no way to tell why.
 *
 * Sent as a header, not in the URL, so the secret stays out of referrer
 * headers and server access logs on every request after the first.
 */
function orderTokenFor(path) {
  const order = path.match(/^\/orders\/(?:hold\/)?([^/?]+)/);
  if (order) return getOrderKey(order[1]);
  const ticket = path.match(/^\/tickets\/([^/?]+)/);
  // The ticket's own token first: a share recipient has only that one, and it
  // is the narrower credential, so preferring it never widens access.
  if (ticket) return getTicketKey(ticket[1]) ?? getTicketOrderKey(ticket[1]);
  return null;
}

async function request(method, path, body, options = {}) {
  const token = getToken();
  const orderToken = options.orderToken ?? orderTokenFor(path);
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(orderToken ? { "X-Order-Token": orderToken } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    // keepalive lets a request survive the page unloading — needed when
    // releasing a hold from a pagehide handler.
    keepalive: options.keepalive === true,
  });

  const data = await res.json().catch(() => null);

  if (res.status === 401 && !path.startsWith("/auth/login")) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

/** Fetches a binary endpoint with the auth header and saves it to a file.
 * A plain <a href> cannot carry the Bearer token, so an owner-checked file
 * would 403 for exactly the people entitled to it. */
export async function downloadFile(path, filename) {
  const token = getToken();
  const orderToken = orderTokenFor(path);
  const res = await fetch(`/api${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // The ticket PDF carries the QR, so it is gated like the ticket itself.
      ...(orderToken ? { "X-Order-Token": orderToken } : {}),
    },
  });
  if (!res.ok) {
    const err = new Error(`Download failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Multipart upload. Deliberately does NOT set Content-Type — the browser
 * must add the multipart boundary itself. */
export async function uploadImage(file) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/uploads/image", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Upload failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data.url;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
  patch: (path, body) => request("PATCH", path, body),
  del: (path, options) => request("DELETE", path, undefined, options),
};

// Shared formatting helpers — kept alongside the API client like multiseller's api.js.
export function money(cents) {
  return new Intl.NumberFormat("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    (cents ?? 0) / 100,
  );
}
