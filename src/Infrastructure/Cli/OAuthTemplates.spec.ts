import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import {
  googleAllowedOriginHelp,
  googleOAuth2Template,
  googleScopesFromSelections,
  xAllowedOriginHelp,
  xOAuth2Template,
  xScopesFromSelections,
} from "./OAuthTemplates.js";

describe("OAuthTemplates", () => {
  it("provides Google OAuth2 endpoint defaults", () => {
    assert.deepStrictEqual(googleOAuth2Template, {
      authorizationUrl:
        "https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&prompt=consent",
      tokenUrl: "https://oauth2.googleapis.com/token",
    });
  });

  it("requests offline Google consent so first activation can receive a refresh token", () => {
    const authorizationUrl = new URL(googleOAuth2Template.authorizationUrl);

    assert.strictEqual(authorizationUrl.searchParams.get("access_type"), "offline");
    assert.strictEqual(authorizationUrl.searchParams.get("prompt"), "consent");
  });

  it("maps selected Google presets and custom scopes to de-duplicated scope strings", () => {
    const scopes = googleScopesFromSelections(
      ["Google Calendar readonly", "Google Drive readonly", "Custom"],
      [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
    );

    assert.deepStrictEqual(scopes, [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/gmail.readonly",
    ]);
  });

  it("documents Google allowed origin and path prefix examples", () => {
    assert.assertTrue(googleAllowedOriginHelp.includes("https://www.googleapis.com"));
    assert.assertTrue(googleAllowedOriginHelp.includes("/calendar/"));
    assert.assertTrue(googleAllowedOriginHelp.includes("/drive/"));
    assert.assertTrue(googleAllowedOriginHelp.includes("https://gmail.googleapis.com"));
    assert.assertTrue(googleAllowedOriginHelp.includes("/gmail/"));
  });

  it("provides X OAuth2 endpoint defaults", () => {
    assert.deepStrictEqual(xOAuth2Template, {
      authorizationUrl: "https://x.com/i/oauth2/authorize",
      tokenUrl: "https://api.x.com/2/oauth2/token",
      tokenAuthMethod: "client_secret_basic",
    });
  });

  it("maps selected X presets and custom scopes to de-duplicated scope strings", () => {
    const scopes = xScopesFromSelections(
      ["Tweet read", "Users read", "Offline access", "Custom"],
      ["tweet.read", "like.read"],
    );

    assert.deepStrictEqual(scopes, ["tweet.read", "users.read", "offline.access", "like.read"]);
  });

  it("documents X allowed origin and path prefix examples", () => {
    assert.assertTrue(xAllowedOriginHelp.includes("https://api.x.com"));
    assert.assertTrue(xAllowedOriginHelp.includes("/2/"));
  });
});
