import { describe, expect, it } from "vitest";
import { parsePayload, resolveScan, signTicket, ticketPayload, verifySignature } from "../ticket-signature.js";
import { makeTicketRef } from "../../domain/ticketRef.js";

describe("ticket signature", () => {
  it("round-trips a signed payload", () => {
    const payload = ticketPayload("ET-2027-ABC123XYZ0", "mawazine-2027");
    const parsed = parsePayload(payload);
    expect(parsed).not.toBeNull();
    expect(parsed!.ref).toBe("ET-2027-ABC123XYZ0");
    expect(parsed!.eventSlug).toBe("mawazine-2027");
    expect(verifySignature(parsed!.ref, parsed!.eventSlug, parsed!.signature)).toBe(true);
  });

  it("rejects a tampered ref", () => {
    const sig = signTicket("ET-2027-AAAAAAAAAA", "mawazine-2027");
    expect(verifySignature("ET-2027-BBBBBBBBBB", "mawazine-2027", sig)).toBe(false);
  });

  it("rejects a signature lifted onto another event", () => {
    const sig = signTicket("ET-2027-AAAAAAAAAA", "mawazine-2027");
    expect(verifySignature("ET-2027-AAAAAAAAAA", "oasis-2026", sig)).toBe(false);
  });

  it("rejects a forged signature of the right length", () => {
    expect(verifySignature("ET-2027-AAAAAAAAAA", "mawazine-2027", "0123456789abcdef")).toBe(false);
  });

  it("treats a non-Eventick payload as unparseable", () => {
    expect(parsePayload("https://example.com/ticket")).toBeNull();
    expect(parsePayload("EVENTICK|only|three")).toBeNull();
  });

  describe("resolveScan", () => {
    const signed = ticketPayload("ET-2027-AAAAAAAAAA", "mawazine-2027");

    it("accepts a valid signed payload from the camera", () => {
      expect(resolveScan(signed, "camera")).toEqual({ ok: true, ref: "ET-2027-AAAAAAAAAA", signed: true });
    });

    it("refuses a signed payload whose signature is wrong", () => {
      expect(resolveScan("EVENTICK|ET-2027-AAAAAAAAAA|mawazine-2027|deadbeefdeadbeef", "camera")).toEqual({
        ok: false,
        reason: "bad-signature",
      });
    });

    /* The hole this closes: refs are printed on every ticket, so if the camera
     * accepted a bare ref anyone could photograph a ticket and encode its
     * reference in a QR of their own. */
    it("REFUSES an unsigned bare ref from the camera", () => {
      expect(resolveScan("ET-2027-AAAAAAAAAA", "camera")).toEqual({ ok: false, reason: "unsigned" });
    });

    it("accepts a hand-typed bare ref, marked unsigned", () => {
      expect(resolveScan("  et-2027-aaaaaaaaaa  ", "manual")).toEqual({
        ok: true,
        ref: "ET-2027-AAAAAAAAAA",
        signed: false,
      });
    });

    it("accepts a signed payload typed in by hand too", () => {
      expect(resolveScan(signed, "manual")).toEqual({ ok: true, ref: "ET-2027-AAAAAAAAAA", signed: true });
    });

    it("refuses input too short to be a ref", () => {
      expect(resolveScan("ab", "manual")).toEqual({ ok: false, reason: "malformed" });
    });
  });
});

describe("makeTicketRef", () => {
  it("keeps the ET-<year>-<suffix> shape", () => {
    expect(makeTicketRef(2027)).toMatch(/^ET-2027-[0-9A-HJKMNP-TV-Z]{10}$/);
  });

  it("does not repeat across many draws", () => {
    const seen = new Set(Array.from({ length: 5000 }, () => makeTicketRef(2027)));
    expect(seen.size).toBe(5000);
  });
});
