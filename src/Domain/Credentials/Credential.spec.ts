import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Either, Redacted, Schema } from "effect";
import { Credential, CreateCredentialInput } from "./Credential.js";

describe("Credential", () => {
  it("decodes OAuth2 create input", () => {
    const decoded = Schema.decodeUnknownSync(CreateCredentialInput)({
      type: "OAuth2",
      label: "Google Calendar",
      allowedRequests: [
        { url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" } },
      ],
      oauth2: {
        clientId: "client-id",
        clientSecret: "client-secret",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      },
    });

    assert.strictEqual(decoded.type, "OAuth2");
    if ("oauth2" in decoded) {
      assert.assertTrue(Redacted.isRedacted(decoded.oauth2.clientSecret));
      assert.strictEqual(Redacted.value(decoded.oauth2.clientSecret), "client-secret");
    } else {
      assert.fail("Expected OAuth2 credential input");
    }
  });

  it("decodes BearerToken create input", () => {
    const decoded = Schema.decodeUnknownSync(CreateCredentialInput)({
      type: "BearerToken",
      label: "Internal API",
      allowedRequests: [{ url: { origin: "https://api.internal.example.com", pathPrefix: "/" } }],
      bearerToken: { token: "secret-token" },
    });

    assert.strictEqual(decoded.type, "BearerToken");
    if ("bearerToken" in decoded) {
      assert.assertTrue(Redacted.isRedacted(decoded.bearerToken.token));
      assert.strictEqual(Redacted.value(decoded.bearerToken.token), "secret-token");
    } else {
      assert.fail("Expected BearerToken credential input");
    }
  });

  it("decodes stored credential status", () => {
    const decoded = Schema.decodeUnknownSync(Credential)({
      credentialId: "cred_0123456789abcdef",
      type: "BearerToken",
      label: "Internal API",
      status: "active",
      allowedRequests: [{ url: { origin: "https://api.internal.example.com", pathPrefix: "/" } }],
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
      bearerToken: { encryptedToken: "encrypted" },
    });

    assert.strictEqual(decoded.status, "active");
  });

  it("rejects create input with no allowed requests", () => {
    const decoded = Schema.decodeUnknownEither(CreateCredentialInput)({
      type: "BearerToken",
      label: "Internal API",
      allowedRequests: [],
      bearerToken: { token: "secret-token" },
    });

    assert.assertTrue(Either.isLeft(decoded));
  });

  it("rejects allowed requests with empty URL parts", () => {
    const decodedWithEmptyOrigin = Schema.decodeUnknownEither(CreateCredentialInput)({
      type: "BearerToken",
      label: "Internal API",
      allowedRequests: [{ url: { origin: "", pathPrefix: "/" } }],
      bearerToken: { token: "secret-token" },
    });

    const decodedWithEmptyPathPrefix = Schema.decodeUnknownEither(CreateCredentialInput)({
      type: "BearerToken",
      label: "Internal API",
      allowedRequests: [{ url: { origin: "https://api.internal.example.com", pathPrefix: "" } }],
      bearerToken: { token: "secret-token" },
    });

    assert.assertTrue(Either.isLeft(decodedWithEmptyOrigin));
    assert.assertTrue(Either.isLeft(decodedWithEmptyPathPrefix));
  });

  it("rejects empty create-time required strings", () => {
    const decodedWithEmptyLabel = Schema.decodeUnknownEither(CreateCredentialInput)({
      type: "OAuth2",
      label: "",
      allowedRequests: [
        { url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" } },
      ],
      oauth2: {
        clientId: "client-id",
        clientSecret: "client-secret",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      },
    });

    const decodedWithEmptyScope = Schema.decodeUnknownEither(CreateCredentialInput)({
      type: "OAuth2",
      label: "Google Calendar",
      allowedRequests: [
        { url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" } },
      ],
      oauth2: {
        clientId: "client-id",
        clientSecret: "client-secret",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: [""],
      },
    });

    assert.assertTrue(Either.isLeft(decodedWithEmptyLabel));
    assert.assertTrue(Either.isLeft(decodedWithEmptyScope));
  });

  it("rejects empty stored credential invariant strings", () => {
    const decoded = Schema.decodeUnknownEither(Credential)({
      credentialId: "cred_0123456789abcdef",
      type: "BearerToken",
      label: "Internal API",
      status: "active",
      allowedRequests: [{ url: { origin: "https://api.internal.example.com", pathPrefix: "/" } }],
      createdAt: "2026-05-27T00:00:00.000Z",
      updatedAt: "2026-05-27T00:00:00.000Z",
      bearerToken: { encryptedToken: "" },
    });

    assert.assertTrue(Either.isLeft(decoded));
  });
});
