import { FileSystem } from "@effect/platform";
import { HttpClient, HttpClientRequest, HttpServer } from "@effect/platform";
import { NodeFileSystem, NodeHttpServer } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect, Layer, Schema } from "effect";
import { createServer, type IncomingMessage } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { CallServiceLive } from "../../Application/Services/CallService.js";
import {
  CredentialServiceLive,
  RedactedCredential,
} from "../../Application/Services/CredentialService.js";
import { OAuth2ServiceLive } from "../../Application/Services/OAuth2Service.js";
import { SecretVault } from "../../Application/Ports/SecretVault.js";
import { makeNodeSecretVault } from "../Encryption/NodeSecretVault.js";
import { OAuth2HttpClient } from "../OAuth2/OAuth2HttpClient.js";
import { AuditLogSqlite } from "../Persistence/Sqlite/AuditLogSqlite.js";
import { CredentialRepositorySqlite } from "../Persistence/Sqlite/CredentialRepositorySqlite.js";
import { runSqliteMigrations } from "../Persistence/Sqlite/Migrations.js";
import { HttpExecutorLive } from "./HttpExecutorLive.js";
import { makeHttpApp } from "./HttpServer.js";

describe("Usher E2E", () => {
  it.scoped("injects a BearerToken credential and returns the upstream response as-is", () =>
    Effect.gen(function* () {
      const upstream = yield* startHttpsUpstream({
        status: 207,
        headers: { "content-type": "application/custom+json", "x-upstream": "bearer" },
        body: '{"ok":true}',
      });

      const result = yield* Effect.gen(function* () {
        yield* runSqliteMigrations;
        yield* HttpServer.serveEffect(
          makeHttpApp({ allowedCallerIps: [], baseUrl: "http://localhost" }),
        );

        const createdResponse = yield* HttpClientRequest.post("/credentials").pipe(
          HttpClientRequest.bodyUnsafeJson({
            type: "BearerToken",
            label: "Bearer upstream",
            allowedRequests: [{ url: { origin: upstream.origin, pathPrefix: "/bearer/" } }],
            bearerToken: { token: "bearer-secret-token" },
          }),
          HttpClient.execute,
        );
        const created = yield* createdResponse.json.pipe(
          Effect.flatMap(Schema.decodeUnknown(RedactedCredential)),
        );
        const callResponse = yield* withInsecureLocalTls(
          HttpClientRequest.post(
            `/call?url=${encodeURIComponent(`${upstream.origin}/bearer/resource`)}`,
          ).pipe(
            HttpClientRequest.setHeader("user-agent", "usher-e2e-bearer"),
            HttpClientRequest.setHeader("x-correlation-id", "bearer-correlation"),
            HttpClientRequest.setHeader("connection", "x-hop-by-hop"),
            HttpClientRequest.setHeader("x-hop-by-hop", "drop-me"),
            HttpClientRequest.bodyText('{"name":"Ada"}', "application/json"),
            HttpClient.execute,
          ),
        );
        const body = yield* callResponse.text;

        return {
          created,
          response: callResponse,
          body,
          received: upstream.received,
        };
      }).pipe(Effect.provide(makeE2ELayer));

      const received = result.received[0];

      assert.strictEqual(result.created.type, "BearerToken");
      assert.strictEqual(result.created.status, "active");
      assert.strictEqual(result.response.status, 207);
      assert.strictEqual(result.response.headers["content-type"], "application/custom+json");
      assert.strictEqual(result.response.headers["x-upstream"], "bearer");
      assert.strictEqual(result.body, '{"ok":true}');
      assert.strictEqual(received?.method, "POST");
      assert.strictEqual(received?.url, "/bearer/resource");
      assert.strictEqual(header(received, "authorization"), "Bearer bearer-secret-token");
      assert.strictEqual(header(received, "user-agent"), "usher-e2e-bearer");
      assert.strictEqual(header(received, "x-correlation-id"), "bearer-correlation");
      assert.strictEqual(header(received, "content-type"), "application/json");
      assert.strictEqual(header(received, "x-hop-by-hop"), undefined);
      assert.strictEqual(received?.body, '{"name":"Ada"}');
    }),
  );

  it.scoped(
    "completes OAuth2 authorization, refreshes, injects access token, and returns upstream response as-is",
    () =>
      Effect.gen(function* () {
        const upstream = yield* startHttpsUpstream({
          status: 203,
          headers: { "content-type": "text/plain", "x-upstream": "oauth2" },
          body: "oauth upstream body",
        });
        const tokenEndpoint = yield* startTokenEndpoint();

        const result = yield* Effect.gen(function* () {
          yield* runSqliteMigrations;
          yield* HttpServer.serveEffect(
            makeHttpApp({ allowedCallerIps: [], baseUrl: "http://localhost" }),
          );

          const createdResponse = yield* HttpClientRequest.post("/credentials").pipe(
            HttpClientRequest.bodyUnsafeJson({
              type: "OAuth2",
              label: "OAuth upstream",
              allowedRequests: [{ url: { origin: upstream.origin, pathPrefix: "/oauth/" } }],
              oauth2: {
                clientId: "client-id",
                clientSecret: "client-secret",
                authorizationUrl: `${tokenEndpoint.origin}/authorize`,
                tokenUrl: `${tokenEndpoint.origin}/token`,
                scopes: ["calendar.readonly"],
              },
            }),
            HttpClient.execute,
          );
          const created = yield* createdResponse.json.pipe(
            Effect.flatMap(Schema.decodeUnknown(RedactedCredential)),
          );
          const credentialId = created.credentialId;
          const loginResponse = yield* HttpClient.get(`/credentials/${credentialId}/oauth2/login`);
          const location = loginResponse.headers.location;
          if (location === undefined) {
            return yield* Effect.die("OAuth2 login did not return a Location header");
          }

          const state = new URL(location).searchParams.get("state");
          if (state === null) {
            return yield* Effect.die("OAuth2 login did not include state");
          }

          const callbackResponse = yield* HttpClient.get(
            `/oauth2/callback?state=${encodeURIComponent(state)}&code=authorization-code`,
          );
          const callbackBody = yield* callbackResponse.text;
          const callResponse = yield* withInsecureLocalTls(
            HttpClientRequest.put(
              `/call?url=${encodeURIComponent(`${upstream.origin}/oauth/events`)}`,
            ).pipe(
              HttpClientRequest.setHeader("user-agent", "usher-e2e-oauth2"),
              HttpClientRequest.setHeader("x-correlation-id", "oauth-correlation"),
              HttpClientRequest.bodyText("oauth request body", "text/plain"),
              HttpClient.execute,
            ),
          );
          const body = yield* callResponse.text;

          return {
            created,
            callbackResponse,
            callbackBody,
            response: callResponse,
            body,
            upstreamReceived: upstream.received,
            tokenRequests: tokenEndpoint.received,
          };
        }).pipe(Effect.provide(makeE2ELayer));

        const received = result.upstreamReceived[0];
        const exchangeRequest = result.tokenRequests[0];
        const refreshRequest = result.tokenRequests[1];

        assert.strictEqual(result.created.type, "OAuth2");
        assert.strictEqual(result.created.status, "pending");
        assert.strictEqual(result.callbackResponse.status, 200);
        assert.strictEqual(result.callbackBody, "OAuth2 credential authorized");
        assert.strictEqual(result.response.status, 203);
        assert.strictEqual(result.response.headers["content-type"], "text/plain");
        assert.strictEqual(result.response.headers["x-upstream"], "oauth2");
        assert.strictEqual(result.body, "oauth upstream body");
        assert.strictEqual(exchangeRequest?.url, "/token");
        assert.strictEqual(exchangeRequest?.body.includes("grant_type=authorization_code"), true);
        assert.strictEqual(exchangeRequest?.body.includes("code=authorization-code"), true);
        assert.strictEqual(refreshRequest?.url, "/token");
        assert.strictEqual(refreshRequest?.body.includes("grant_type=refresh_token"), true);
        assert.strictEqual(
          refreshRequest?.body.includes("refresh_token=refresh-token-from-callback"),
          true,
        );
        assert.strictEqual(received?.method, "PUT");
        assert.strictEqual(received?.url, "/oauth/events");
        assert.strictEqual(header(received, "authorization"), "Bearer access-token-from-refresh");
        assert.strictEqual(header(received, "user-agent"), "usher-e2e-oauth2");
        assert.strictEqual(header(received, "x-correlation-id"), "oauth-correlation");
        assert.strictEqual(header(received, "content-type"), "text/plain");
        assert.strictEqual(received?.body, "oauth request body");
      }),
  );
});

type ReceivedRequest = {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingMessage["headers"];
  readonly body: string;
};

type FakeServer = {
  readonly origin: string;
  readonly received: ReadonlyArray<ReceivedRequest>;
};

function startHttpsUpstream(response: {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}) {
  return Effect.acquireRelease(
    Effect.async<FakeServer, unknown>((resume) => {
      const received: Array<ReceivedRequest> = [];
      const server = createHttpsServer(
        { key: LocalhostKey, cert: LocalhostCert },
        (request, serverResponse) => {
          collectRequest(request).then(
            (body) => {
              received.push({
                method: request.method ?? "",
                url: request.url ?? "",
                headers: request.headers,
                body,
              });
              serverResponse.writeHead(response.status, response.headers);
              serverResponse.end(response.body);
            },
            (error: unknown) => {
              serverResponse.writeHead(500, { "content-type": "text/plain" });
              serverResponse.end(String(error));
            },
          );
        },
      );

      server.once("error", (error) => resume(Effect.fail(error)));
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (isAddressInfo(address)) {
          activeServers.set(`https://127.0.0.1:${address.port}`, server);
          resume(
            Effect.succeed({
              origin: `https://127.0.0.1:${address.port}`,
              received,
            }),
          );
        } else {
          resume(Effect.fail(new Error("HTTPS upstream did not bind to a TCP port")));
        }
      });
    }),
    (server) => closeServerByOrigin(server.origin),
  );
}

function startTokenEndpoint() {
  return Effect.acquireRelease(
    Effect.async<FakeServer, unknown>((resume) => {
      const received: Array<ReceivedRequest> = [];
      const server = createServer((request, serverResponse) => {
        collectRequest(request).then(
          (body) => {
            received.push({
              method: request.method ?? "",
              url: request.url ?? "",
              headers: request.headers,
              body,
            });
            const responseBody = body.includes("grant_type=authorization_code")
              ? {
                  access_token: "access-token-from-code",
                  refresh_token: "refresh-token-from-callback",
                  scope: "calendar.readonly",
                }
              : { access_token: "access-token-from-refresh", scope: "calendar.readonly" };

            serverResponse.writeHead(200, { "content-type": "application/json" });
            serverResponse.end(JSON.stringify(responseBody));
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
          activeServers.set(`http://127.0.0.1:${address.port}`, server);
          resume(
            Effect.succeed({
              origin: `http://127.0.0.1:${address.port}`,
              received,
            }),
          );
        } else {
          resume(Effect.fail(new Error("Token endpoint did not bind to a TCP port")));
        }
      });
    }),
    (server) => closeServerByOrigin(server.origin),
  );
}

const activeServers = new Map<
  string,
  ReturnType<typeof createServer> | ReturnType<typeof createHttpsServer>
>();

function isAddressInfo(address: AddressInfo | string | null): address is AddressInfo {
  return typeof address === "object" && address !== null;
}

function closeServerByOrigin(origin: string) {
  const server = activeServers.get(origin);
  activeServers.delete(origin);
  if (server === undefined) {
    return Effect.void;
  }

  return Effect.async<void, unknown>((resume) => {
    server.close((error) => {
      if (error === undefined) {
        resume(Effect.void);
      } else {
        resume(Effect.fail(error));
      }
    });
  }).pipe(Effect.orDie);
}

function collectRequest(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Array<Buffer> = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function header(request: ReceivedRequest | undefined, name: string) {
  const value = request?.headers[name];

  return Array.isArray(value) ? value.join(", ") : value;
}

function withInsecureLocalTls<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

      return previous;
    }),
    () => effect,
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        } else {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
        }
      }),
  );
}

const makeE2ELayer = Layer.unwrapScoped(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const dir = yield* fs.makeTempDirectoryScoped();
    const sqlite = SqliteClient.layer({ filename: `${dir}/usher-e2e.db` });
    const repositories = Layer.provide(
      Layer.mergeAll(CredentialRepositorySqlite, AuditLogSqlite),
      sqlite,
    );
    const vault = Layer.succeed(
      SecretVault,
      makeNodeSecretVault(
        new Uint8Array([
          0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
          25, 26, 27, 28, 29, 30, 31,
        ]),
      ),
    );
    const adapters = Layer.mergeAll(repositories, vault, OAuth2HttpClient, HttpExecutorLive);
    const services = Layer.provide(
      Layer.mergeAll(
        CredentialServiceLive({ baseUrl: "http://localhost" }),
        OAuth2ServiceLive({ stateTtlMillis: 10 * 60 * 1000 }),
        CallServiceLive,
      ),
      adapters,
    );

    return Layer.mergeAll(sqlite, services, repositories, NodeHttpServer.layerTest);
  }),
).pipe(Layer.provide(NodeFileSystem.layer));

const LocalhostCert = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUDhB+UT+yrUVslISddO7oWop5/AswDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDUyNzE2NTM0MloXDTI2MDUy
ODE2NTM0MlowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEArJSam4Aamhu+IolwizXVgtHHUU/GMZswwUN1LJJ8I+Kw
Ag3ACaZLmZNfbua/74iw1cEM2c/xHQYRP0UqBx4GNdLzZOuwGLnEm99SkQ0q/pqn
01+UuYYBWCeIYgVTXdXOhUHpJBsKyMvDaseAhdOy8xMfXmbty2iLeQysZF9OHtcZ
ft0XkmNadWeimwqZ74agHV7E3sbbiaBfVdDIo+MTv+ZUbTrBLXuzizrXFvPjk2R5
rvupCZfmlhLJ5Z+1ivDODi58k4dOI1Ryw03mXft8DtQlSRGhyGtJOu6uc44CfvXS
FSAx2kJy1z7MpVzpA8xeUE/4PPBckJgplJ2e1gry9wIDAQABo1MwUTAdBgNVHQ4E
FgQUBZiV8AKYvAP1FSkw+tFdBgH1We4wHwYDVR0jBBgwFoAUBZiV8AKYvAP1FSkw
+tFdBgH1We4wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAohX8
+dhnl18PrLrUQ5tC4cZeQai1hSn473j6GCgGtGPiUzRivCSPStxzoJB6CKiKSTgY
JXxD9mdJWjqEV1C736fyfv+A7Ei6KKBacZ8GN8MlYB3Z9atvFp51WBHUcfKevyVj
sPPwkWyTt6GlqApiajXEzKZ4bhQjQMX+INiB5jAUrTE3+9NPzRc+5S/q+oYgV1jY
AHiNJNSSb9iypsFHZKZBa14hVNe5KLejxf8RpcDP/ru3T042aIfqy82JgqGJF84O
HvbU4OGVEaGOVa4s4p5LYXEL+dk6YRmmgoriRZAoxJ7z7WrmMJzndi1hsftDb3LD
ahbjm36N6IDVxYySNw==
-----END CERTIFICATE-----`;

const LocalhostKey = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCslJqbgBqaG74i
iXCLNdWC0cdRT8YxmzDBQ3Usknwj4rACDcAJpkuZk19u5r/viLDVwQzZz/EdBhE/
RSoHHgY10vNk67AYucSb31KRDSr+mqfTX5S5hgFYJ4hiBVNd1c6FQekkGwrIy8Nq
x4CF07LzEx9eZu3LaIt5DKxkX04e1xl+3ReSY1p1Z6KbCpnvhqAdXsTextuJoF9V
0Mij4xO/5lRtOsEte7OLOtcW8+OTZHmu+6kJl+aWEsnln7WK8M4OLnyTh04jVHLD
TeZd+3wO1CVJEaHIa0k67q5zjgJ+9dIVIDHaQnLXPsylXOkDzF5QT/g88FyQmCmU
nZ7WCvL3AgMBAAECggEAHGJ4p1jDh1NGy3FlhE//ZPvR14rSYzhOJYtNy13wcwqG
vl+6lRu31XOKv7fOG7yUsSOGVJDB7G8iCRD8H52Nke63P4MQPJDZSHXLo7XRu3x+
W+KdmIH02KXv5YdQtd9Dj2FO0jRsaqgw5PAZMGmoRhiAEUvGkq0IO4mdFQkj1Shw
aWtx+fC7rSl/dc8MYP4UMdfnjGzh9tk3EGIHVorS5wDgrM2r3jvs+ezvJS9nQkIl
rSbde212oZ7EbqbzXDBtD87bKqEJVm3kPX6xmC6b/UNtoxsnAVW1FWuCbqppDdHA
h0ABlnbv3/WcsADrc0HnEqd90y6khtw6XldAvjYaKQKBgQDg15FKZ9/LnufgC0ud
MO1xp5EjU6SuPPKWXKKMFfDreZrPHFd8XB1saBsLne6C7FOre23/6Z41mhUTC7Yc
YjtW/MRBytPY8RsclaVQQgVUUF/TXR8hVveXnD1bibFskGlSNfv7sZM69ZGAMwJr
/6mRHdyEA2Ho3Waz/EwzxZ54gwKBgQDEfwUKhtAW1QvScWGxeuyQGQip94SKKv9L
9qkyQdjyuQMdcQlxU866hIZMMbwNFbTrMWEXPwSLLCuM4A37mVX8D9Ne96A+s/C9
t/q8Lui7hM2xdGtKfuCf5kK/eFdIw1Qh/QGQd/L3+RtE2xmLnj2VZTb/yXImJQg/
dJtx0mSJfQKBgQCaYmpY9MouPoZoyFi7LoVbrPtzjlNdcGwB4smZ9tbeWTl7TLKl
qXpqnXE0oNTNAQjSjoYRWpBPreUalsgM5UZpjFYV9vdP1v4OupIwcaTHKAkkUKS3
d8e6SoW2/Oze5qnq0TactGmr6kJmDKB1F6+O/ToVS11HT/7dRzfrtJ4DkQKBgQCw
s6Ud5UQF9EpwUaPPzcIkh06iQkL/WVFBx6w51Ls68yOY+0jJj9stIfX/WQ5KGgYb
Jsmv9OyqFuuHAQmyAx8u0DB9i2OgX4KTqXoidnC2CORMu2usj1KCmLfXpWmgtn7X
HcWlXCiz1GEwV3OueXvZ+C4wccBkCxNStRMAlXnxpQKBgQDgPcqmxMzI8dDoYnSN
NNm1lDc30Uq5V14ub5mCBFSiMApwpN11tc2yBzecnWwIUreaObchS1XtBdg7NPDp
lc/tLI7MEctMBoPcynYWXl0FgI5qeJXSCeoYDkImi+EmJKlUpwDPcOJso4gsGkGp
aNxS0FUyKgzyleyhPivmw4EHnQ==
-----END PRIVATE KEY-----`;
