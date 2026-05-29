import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Redacted } from "effect";
import {
  buildBearerTokenCredentialInput,
  buildOAuth2CredentialInput,
} from "./CredentialPrompts.js";

describe("CredentialPrompts", () => {
  it("builds a bearer token credential input", () => {
    const input = buildBearerTokenCredentialInput({
      label: "Internal API",
      origin: "https://api.example.com",
      pathPrefix: "/v1/",
      token: "secret-token",
    });

    assert.strictEqual(input.type, "BearerToken");
    assert.strictEqual(input.label, "Internal API");
    assert.deepStrictEqual(input.allowedRequests, [
      { url: { origin: "https://api.example.com", pathPrefix: "/v1/" } },
    ]);
    assert.assertTrue(Redacted.isRedacted(input.bearerToken.token));
    assert.strictEqual(Redacted.value(input.bearerToken.token), "secret-token");
  });

  it("builds an OAuth2 credential input", () => {
    const input = buildOAuth2CredentialInput({
      label: "Google Calendar",
      origin: "https://www.googleapis.com",
      pathPrefix: "/calendar/",
      clientId: "client-id",
      clientSecret: "client-secret",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      tokenAuthMethod: "client_secret_post",
    });

    assert.strictEqual(input.type, "OAuth2");
    assert.strictEqual(input.label, "Google Calendar");
    assert.deepStrictEqual(input.allowedRequests, [
      { url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" } },
    ]);
    assert.strictEqual(input.oauth2.clientId, "client-id");
    assert.assertTrue(Redacted.isRedacted(input.oauth2.clientSecret));
    assert.strictEqual(Redacted.value(input.oauth2.clientSecret), "client-secret");
    assert.strictEqual(
      input.oauth2.authorizationUrl,
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    assert.strictEqual(input.oauth2.tokenUrl, "https://oauth2.googleapis.com/token");
    assert.deepStrictEqual(input.oauth2.scopes, [
      "https://www.googleapis.com/auth/calendar.readonly",
    ]);
    assert.strictEqual(input.oauth2.tokenAuthMethod, "client_secret_post");
  });

  it("builds an X OAuth2 credential input with client secret basic token auth", () => {
    const input = buildOAuth2CredentialInput({
      label: "X API",
      origin: "https://api.x.com",
      pathPrefix: "/2/",
      clientId: "client-id",
      clientSecret: "client-secret",
      authorizationUrl: "https://x.com/i/oauth2/authorize",
      tokenUrl: "https://api.x.com/2/oauth2/token",
      scopes: ["tweet.read", "users.read", "offline.access"],
      tokenAuthMethod: "client_secret_basic",
    });

    assert.strictEqual(input.type, "OAuth2");
    assert.strictEqual(input.label, "X API");
    assert.deepStrictEqual(input.allowedRequests, [
      { url: { origin: "https://api.x.com", pathPrefix: "/2/" } },
    ]);
    assert.strictEqual(input.oauth2.authorizationUrl, "https://x.com/i/oauth2/authorize");
    assert.strictEqual(input.oauth2.tokenUrl, "https://api.x.com/2/oauth2/token");
    assert.deepStrictEqual(input.oauth2.scopes, ["tweet.read", "users.read", "offline.access"]);
    assert.strictEqual(input.oauth2.tokenAuthMethod, "client_secret_basic");
  });
});
