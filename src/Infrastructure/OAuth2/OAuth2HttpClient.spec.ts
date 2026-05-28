import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect } from "effect";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { OAuth2Client } from "../../Application/Ports/OAuth2Client.js";
import { OAuthTokenExchangeFailedError } from "../../Domain/Errors/UsherErrors.js";
import { OAuth2HttpClient } from "./OAuth2HttpClient.js";

describe("OAuth2HttpClient", () => {
  it.scoped("includes provider error details when authorization code exchange fails", () =>
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
          clientSecret: "client-secret",
          code: "auth-code",
          redirectUri: "http://127.0.0.1:3000/oauth2/callback",
          codeVerifier: "code-verifier",
        })
        .pipe(Effect.flip);

      assert.assertInstanceOf(error, OAuthTokenExchangeFailedError);
      assert.strictEqual(
        error.message,
        "OAuth token exchange failed: provider returned 400 invalid_grant: Bad Request",
      );
    }).pipe(Effect.provide(OAuth2HttpClient)),
  );
});

function startTokenEndpoint(response: { readonly status: number; readonly body: unknown }) {
  return Effect.acquireRelease(
    Effect.async<
      { readonly origin: string; readonly server: ReturnType<typeof createServer> },
      unknown
    >((resume) => {
      const server = createServer((_request, serverResponse) => {
        serverResponse.writeHead(response.status, { "content-type": "application/json" });
        serverResponse.end(JSON.stringify(response.body));
      });

      server.once("error", (error) => resume(Effect.fail(error)));
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (isAddressInfo(address)) {
          resume(Effect.succeed({ origin: `http://127.0.0.1:${address.port}`, server }));
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

function isAddressInfo(address: AddressInfo | string | null): address is AddressInfo {
  return typeof address === "object" && address !== null;
}
