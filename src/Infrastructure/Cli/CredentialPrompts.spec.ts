import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import {
  buildBearerTokenCredentialInput,
  buildOAuth2CredentialInput,
} from "./CredentialPrompts.js";

describe("CredentialPrompts", () => {
  it("builds a bearer token credential input", () => {
    assert.deepStrictEqual(
      buildBearerTokenCredentialInput({
        label: "Internal API",
        origin: "https://api.example.com",
        pathPrefix: "/v1/",
        token: "secret-token",
      }),
      {
        type: "BearerToken",
        label: "Internal API",
        allowedRequests: [{ url: { origin: "https://api.example.com", pathPrefix: "/v1/" } }],
        bearerToken: { token: "secret-token" },
      },
    );
  });

  it("builds an OAuth2 credential input", () => {
    assert.deepStrictEqual(
      buildOAuth2CredentialInput({
        label: "Google Calendar",
        origin: "https://www.googleapis.com",
        pathPrefix: "/calendar/",
        clientId: "client-id",
        clientSecret: "client-secret",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      }),
      {
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
      },
    );
  });
});
