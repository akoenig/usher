import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import {
  formatCredentialCreated,
  formatCredentialDeleted,
  formatCredentialDetail,
  formatCredentialList,
} from "./CredentialFormatting.js";

describe("CredentialFormatting", () => {
  it("formats an empty credential list", () => {
    assert.strictEqual(formatCredentialList([]), "No credentials found.");
  });

  it("formats credential list rows without exposing secrets", () => {
    assert.strictEqual(
      formatCredentialList([
        {
          credentialId: "cred_0123456789abcdef",
          type: "BearerToken",
          label: "Internal API",
          status: "active",
          allowedRequests: [{ url: { origin: "https://api.example.com", pathPrefix: "/v1/" } }],
          createdAt: "2026-05-28T00:00:00.000Z",
          updatedAt: "2026-05-28T00:00:00.000Z",
          tokenPreview: "********",
        },
      ]),
      "cred_0123456789abcdef  BearerToken  active  Internal API",
    );
  });

  it("formats OAuth2 detail with login URL", () => {
    const text = formatCredentialDetail({
      credentialId: "cred_0123456789abcdef",
      type: "OAuth2",
      label: "Google Calendar",
      status: "pending",
      allowedRequests: [
        { url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" } },
      ],
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
      clientId: "client-id",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      grantedScopes: [],
      clientSecretPreview: "********",
      loginUrl: "https://usher.example.com/credentials/cred_0123456789abcdef/oauth2/login",
    });

    assert.assertTrue(
      text.includes(
        "Login URL: https://usher.example.com/credentials/cred_0123456789abcdef/oauth2/login",
      ),
    );
    assert.assertFalse(text.includes("client-secret"));
  });

  it("formats OAuth2 created output with authorization prompt", () => {
    const text = formatCredentialCreated({
      credentialId: "cred_0123456789abcdef",
      type: "OAuth2",
      label: "Google Calendar",
      status: "pending",
      allowedRequests: [
        { url: { origin: "https://www.googleapis.com", pathPrefix: "/calendar/" } },
      ],
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
      clientId: "client-id",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      grantedScopes: [],
      clientSecretPreview: "********",
      loginUrl: "https://usher.example.com/credentials/cred_0123456789abcdef/oauth2/login",
    });

    assert.assertTrue(text.includes("Open this URL to authorize the credential:"));
    assert.assertTrue(
      text.includes("https://usher.example.com/credentials/cred_0123456789abcdef/oauth2/login"),
    );
  });

  it("formats deleted credential output", () => {
    assert.strictEqual(
      formatCredentialDeleted("cred_0123456789abcdef"),
      "Deleted credential cred_0123456789abcdef",
    );
  });
});
