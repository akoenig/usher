import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect, Redacted } from "effect";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { OAuth2Client } from "../../Application/Ports/OAuth2Client.js";
import { OAuthTokenExchangeFailedError } from "../../Domain/Errors/UsherErrors.js";
import { OAuth2HttpClient } from "./OAuth2HttpClient.js";

describe("OAuth2HttpClient", () => {
  it.effect("unwraps redacted authorization parameters only in the provider URL", () =>
    Effect.gen(function* () {
      const client = yield* OAuth2Client;
      const url = yield* client.buildAuthorizationUrl({
        authorizationUrl: "https://provider.example.com/authorize",
        clientId: "client-id",
        redirectUri: "http://127.0.0.1:3000/oauth2/callback",
        scopes: ["calendar.readonly"],
        state: Redacted.make("oauth-state"),
        codeVerifier: Redacted.make("code-verifier"),
      });
      const parsed = new URL(url);

      assert.strictEqual(parsed.searchParams.get("state"), "oauth-state");
      assert.strictEqual(parsed.searchParams.get("code_challenge"), "code-verifier");
    }).pipe(Effect.provide(OAuth2HttpClient)),
  );

  it.scoped("sends authorization code exchange as form urlencoded", () =>
    Effect.gen(function* () {
      const tokenEndpoint = yield* startTokenEndpoint({
        status: 200,
        body: {
          access_token: "access-token",
        },
      });
      const client = yield* OAuth2Client;
      const tokenResponse = yield* client.exchangeAuthorizationCode({
        tokenUrl: `${tokenEndpoint.origin}/token`,
        clientId: "client-id",
        clientSecret: Redacted.make("client-secret"),
        code: "auth-code",
        redirectUri: "http://127.0.0.1:3000/oauth2/callback",
        codeVerifier: Redacted.make("code-verifier"),
      });

      const received = tokenEndpoint.received[0];

      assert.strictEqual(received?.headers["content-type"], "application/x-www-form-urlencoded");
      assert.strictEqual(
        received?.body,
        "grant_type=authorization_code&client_id=client-id&client_secret=client-secret&code=auth-code&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Foauth2%2Fcallback&code_verifier=code-verifier",
      );
      assert.assertTrue(Redacted.isRedacted(tokenResponse.accessToken));
      assert.strictEqual(Redacted.value(tokenResponse.accessToken), "access-token");
    }).pipe(Effect.provide(OAuth2HttpClient)),
  );

  it.scoped("sends refresh token exchange as form urlencoded", () =>
    Effect.gen(function* () {
      const tokenEndpoint = yield* startTokenEndpoint({
        status: 200,
        body: {
          access_token: "access-token",
          refresh_token: "next-refresh-token",
        },
      });
      const client = yield* OAuth2Client;
      const tokenResponse = yield* client.refreshAccessToken({
        tokenUrl: `${tokenEndpoint.origin}/token`,
        clientId: "client-id",
        clientSecret: Redacted.make("client-secret"),
        refreshToken: Redacted.make("refresh-token"),
      });
      const received = tokenEndpoint.received[0];

      assert.strictEqual(
        received?.body,
        "grant_type=refresh_token&client_id=client-id&client_secret=client-secret&refresh_token=refresh-token",
      );
      assert.assertTrue(Redacted.isRedacted(tokenResponse.accessToken));
      assert.strictEqual(Redacted.value(tokenResponse.accessToken), "access-token");
      assert.assertTrue(Redacted.isRedacted(tokenResponse.refreshToken));
      assert.strictEqual(Redacted.value(tokenResponse.refreshToken), "next-refresh-token");
    }).pipe(Effect.provide(OAuth2HttpClient)),
  );

  it.scoped(
    "does not include structured provider error details when authorization code exchange fails",
    () =>
      Effect.gen(function* () {
        const tokenEndpoint = yield* startTokenEndpoint({
          status: 400,
          body: {
            error: "invalid_grant",
            error_description: "Bad Request",
          },
        });
        const client = yield* OAuth2Client;
        const error = yield* client
          .exchangeAuthorizationCode({
            tokenUrl: `${tokenEndpoint.origin}/token`,
            clientId: "client-id",
            clientSecret: Redacted.make("client-secret"),
            code: "auth-code",
            redirectUri: "http://127.0.0.1:3000/oauth2/callback",
            codeVerifier: Redacted.make("code-verifier"),
          })
          .pipe(Effect.flip);

        assert.assertInstanceOf(error, OAuthTokenExchangeFailedError);
        assert.strictEqual(error.message, "OAuth token exchange failed: provider returned 400");
      }).pipe(Effect.provide(OAuth2HttpClient)),
  );

  it.scoped("does not include unrecognized provider error body text", () =>
    Effect.gen(function* () {
      const tokenEndpoint = yield* startTokenEndpoint({
        status: 400,
        body: "provider echoed client_secret=client-secret",
      });
      const client = yield* OAuth2Client;
      const error = yield* client
        .exchangeAuthorizationCode({
          tokenUrl: `${tokenEndpoint.origin}/token`,
          clientId: "client-id",
          clientSecret: Redacted.make("client-secret"),
          code: "auth-code",
          redirectUri: "http://127.0.0.1:3000/oauth2/callback",
          codeVerifier: Redacted.make("code-verifier"),
        })
        .pipe(Effect.flip);

      assert.assertInstanceOf(error, OAuthTokenExchangeFailedError);
      assert.strictEqual(error.message, "OAuth token exchange failed: provider returned 400");
    }).pipe(Effect.provide(OAuth2HttpClient)),
  );
});

function startTokenEndpoint(response: { readonly status: number; readonly body: unknown }) {
  return Effect.acquireRelease(
    Effect.async<
      {
        readonly origin: string;
        readonly received: Array<ReceivedRequest>;
        readonly server: ReturnType<typeof createServer>;
      },
      unknown
    >((resume) => {
      const received: Array<ReceivedRequest> = [];
      const server = createServer((request, serverResponse) => {
        collectRequest(request).then(
          (body) => {
            received.push({ headers: request.headers, body });
            serverResponse.writeHead(response.status, { "content-type": "application/json" });
            serverResponse.end(JSON.stringify(response.body));
          },
          (error: unknown) => {
            serverResponse.writeHead(500, { "content-type": "text/plain" });
            serverResponse.end(String(error));
          },
        );
      });

      server.once("error", (error) => resume(Effect.fail(error)));
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (isAddressInfo(address)) {
          resume(
            Effect.succeed({
              origin: `http://127.0.0.1:${address.port}`,
              received,
              server,
            }),
          );
        } else {
          resume(Effect.fail(new Error("Token endpoint did not bind to a TCP port")));
        }
      });
    }),
    ({ server }) =>
      Effect.async<void, never>((resume) => {
        server.closeAllConnections();
        server.close(() => resume(Effect.void));
      }).pipe(Effect.orDie),
  );
}

type ReceivedRequest = {
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
};

function collectRequest(request: NodeJS.ReadableStream) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Array<Buffer> = [];

    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function isAddressInfo(address: AddressInfo | string | null): address is AddressInfo {
  return typeof address === "object" && address !== null;
}
