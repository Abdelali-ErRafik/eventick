import { Resend } from "resend";
import { logger } from "./logger.js";

/**
 * Transactional email via Resend.
 *
 * NEVER THROWS. A failed send must not fail the HTTP request that triggered it
 * — a buyer whose card was charged must still get their order, even if the
 * confirmation email bounces. Callers treat the boolean as logging/test signal,
 * never as a reason to branch the response.
 *
 * With no RESEND_API_KEY the module stays in log-only mode, so the whole flow
 * is exercisable locally without credentials.
 */

let client: Resend | null | undefined;

function getClient(): Resend | null {
  if (client !== undefined) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logger.warn("RESEND_API_KEY unset — emails will be logged, not sent");
    client = null;
    return client;
  }
  client = new Resend(key);
  return client;
}

const FROM = () => process.env.RESEND_FROM_EMAIL ?? "Eventick <onboarding@resend.dev>";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    logger.info({ to: redact(input.to), subject: input.subject }, "email (log-only mode)");
    return false;
  }
  try {
    const result = await resend.emails.send({
      from: FROM(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments?.map((file) => ({ filename: file.filename, content: file.content })),
    });
    if (result.error) {
      logger.warn({ to: redact(input.to), err: result.error.message }, "email rejected by provider");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ to: redact(input.to), err: err instanceof Error ? err.message : String(err) }, "email send failed");
    return false;
  }
}

/** An address is personal data — logs keep the domain only. */
function redact(email: string): string {
  const at = email.indexOf("@");
  return at === -1 ? "***" : `***${email.slice(at)}`;
}
