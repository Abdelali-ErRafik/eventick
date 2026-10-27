import { prisma } from "./prisma.js";
import { HttpError } from "./http.js";
import { logger } from "./logger.js";

/** Postgres serialization failure, surfaced by Prisma. */
const SERIALIZATION_FAILURE = "P2034";

function isSerializationFailure(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === SERIALIZATION_FAILURE;
}

/**
 * Runs a transaction at Serializable isolation, retrying if Postgres aborts it
 * for overlapping with another.
 *
 * The seat-claim path reads a committed count and then writes a claim against
 * it. Under the Read Committed default, concurrent claims each read a count
 * that excludes the others' uncommitted rows, so all of them believe a seat is
 * free — five buyers took three seats in testing.
 *
 * Serializable prevents that, but it aborts the losers indiscriminately: a
 * buyer whose seat really was available gets refused simply for arriving at
 * the same moment. Retrying distinguishes the two — on the second attempt the
 * winner's row is committed and visible, so a genuine oversell still fails the
 * capacity check and returns 409, while a false conflict succeeds.
 */
export async function withSerializableRetry<T>(
  fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>,
  attempts = 5,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (err) {
      // A genuine rejection (sold out, bad tier) must surface immediately —
      // retrying it would just fail the same way more slowly.
      if (err instanceof HttpError) throw err;
      if (!isSerializationFailure(err)) throw err;

      lastError = err;
      // Brief jittered backoff so retries don't collide in lockstep.
      await new Promise((resolve) => setTimeout(resolve, 15 * attempt + Math.random() * 20));
    }
  }

  logger.warn({ err: lastError, attempts }, "serializable transaction exhausted its retries");
  throw new HttpError(409, "Too many people are booking at once. Please try again.");
}
