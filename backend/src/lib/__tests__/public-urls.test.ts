import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertPublicUrls } from "../public-urls.js";

/**
 * The guard that stops a deployed server advertising localhost.
 *
 * Worth testing properly because its failure mode is the opposite of loud:
 * a wrong PUBLIC_APP_URL sends a working email containing a dead link, and
 * nobody learns until a guest is turned away at a door.
 */
describe("assertPublicUrls", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    process.env.PUBLIC_APP_URL = "https://eventick.ma";
    process.env.PUBLIC_API_URL = "https://api.eventick.ma";
    delete process.env.CMI_CALLBACK_URL;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("passes on real https hosts", () => {
    expect(() => assertPublicUrls()).not.toThrow();
  });

  it("is silent outside production", () => {
    // Every one of these values is CORRECT as localhost in development.
    // Failing there would make the app unrunnable for the thing it is for.
    process.env.NODE_ENV = "development";
    process.env.PUBLIC_APP_URL = "http://localhost:3100";
    process.env.PUBLIC_API_URL = "http://localhost:4100";
    expect(() => assertPublicUrls()).not.toThrow();
  });

  it("refuses a localhost app URL in production", () => {
    process.env.PUBLIC_APP_URL = "http://localhost:3100";
    expect(() => assertPublicUrls()).toThrow(/PUBLIC_APP_URL still points at localhost/);
  });

  it("refuses 127.0.0.1 as well as the name", () => {
    process.env.PUBLIC_API_URL = "http://127.0.0.1:4100";
    expect(() => assertPublicUrls()).toThrow(/PUBLIC_API_URL still points at 127\.0\.0\.1/);
  });

  it("refuses an ephemeral tunnel in the CMI callback", () => {
    // The worst of the set: CMI's callback is the only thing that issues a
    // ticket, so a dead tunnel means a charged card and no ticket.
    process.env.CMI_CALLBACK_URL = "https://mineral-tumor-warrior.trycloudflare.com/api/webhooks/cmi";
    expect(() => assertPublicUrls()).toThrow(/ephemeral \.trycloudflare\.com tunnel/);
  });

  it("refuses an ngrok tunnel too", () => {
    process.env.CMI_CALLBACK_URL = "https://abc123.ngrok-free.app/api/webhooks/cmi";
    expect(() => assertPublicUrls()).toThrow(/ephemeral \.ngrok-free\.app tunnel/);
  });

  it("allows CMI_CALLBACK_URL to be unset", () => {
    // Unset is fine: the code falls back to PUBLIC_API_URL + the webhook
    // path, which is already checked. Only a value that IS set and wrong is
    // a problem.
    delete process.env.CMI_CALLBACK_URL;
    expect(() => assertPublicUrls()).not.toThrow();
  });

  it("refuses plain http on a real host", () => {
    process.env.PUBLIC_APP_URL = "http://eventick.ma";
    expect(() => assertPublicUrls()).toThrow(/is not https/);
  });

  it("refuses an unset app URL", () => {
    delete process.env.PUBLIC_APP_URL;
    expect(() => assertPublicUrls()).toThrow(/PUBLIC_APP_URL is unset/);
  });

  it("reports every problem at once, not just the first", () => {
    // One restart should tell you everything to fix, rather than making a
    // deploy a sequence of one-line corrections.
    process.env.PUBLIC_APP_URL = "http://localhost:3100";
    process.env.PUBLIC_API_URL = "http://localhost:4100";
    try {
      assertPublicUrls();
      throw new Error("expected a throw");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(/PUBLIC_APP_URL/);
      expect(message).toMatch(/PUBLIC_API_URL/);
    }
  });
});
