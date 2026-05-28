import { HttpClient, HttpClientRequest, HttpServer } from "@effect/platform";
import { NodeHttpServer } from "@effect/platform-node";
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect, Layer, LogLevel, Logger, Option, Redacted, Ref } from "effect";
import {
  AuditLog,
  type AuditEvent,
  type AuditEventReadOptions,
} from "../../Application/Ports/AuditLog.js";
import { CallService, type CallCommand } from "../../Application/Services/CallService.js";
import { CredentialService } from "../../Application/Services/CredentialService.js";
import { OAuth2Service } from "../../Application/Services/OAuth2Service.js";
import {
  NoMatchingCredentialError,
  UpstreamRequestFailedError,
} from "../../Domain/Errors/UsherErrors.js";
import { makeHttpApp, peerAddressForAccessControl } from "./HttpServer.js";

describe("HttpServer", () => {
  it("uses the actual peer address for access control instead of forwarded headers", () => {
    const sourceIp = peerAddressForAccessControl({
      headers: { "x-forwarded-for": "127.0.0.1" },
      remoteAddress: Option.some("203.0.113.10"),
    });

    assert.strictEqual(sourceIp, "203.0.113.10");
  });

  it.effect("rejects an admin request when a non-loopback peer spoofs forwarded loopback", () =>
    Effect.gen(function* () {
      const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([]);

      return yield* Effect.gen(function* () {
        yield* HttpServer.serveEffect(
          makeHttpApp({
            allowedCallerIps: [],
            baseUrl: "https://usher.example.com",
            peerAddressProvider: () => "203.0.113.10",
          }),
        );
        const response = yield* HttpClient.get("/credentials", {
          headers: { "x-forwarded-for": "127.0.0.1" },
        });
        const body = yield* response.json;

        assert.strictEqual(response.status, 403);
        assert.strictEqual(response.headers["x-usher-error"], "true");
        assert.strictEqual(response.headers["x-usher-error-code"], "CallerIpNotAllowedError");
        assert.deepStrictEqual(body, {
          error: {
            code: "CallerIpNotAllowedError",
            message: "Caller IP is not allowed",
          },
        });
      }).pipe(Effect.scoped, Effect.provide(makeTestLayer(commands, "success")));
    }),
  );

  it.effect(
    "returns recent audit events with the default admin events limit",
    () =>
      Effect.gen(function* () {
        const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([]);
        const auditReadRecentOptions = yield* Ref.make<ReadonlyArray<AuditEventReadOptions>>([]);
        const events = [auditEvent(1, "https://api.example.com/v1/users")];

        return yield* Effect.gen(function* () {
          yield* HttpServer.serveEffect(
            makeHttpApp({ allowedCallerIps: [], baseUrl: "https://usher.example.com" }),
          );
          const response = yield* HttpClient.get("/events");
          const body = yield* response.json;
          const calls = yield* Ref.get(auditReadRecentOptions);

          assert.strictEqual(response.status, 200);
          assert.deepStrictEqual(calls, [{ limit: 10 }]);
          assert.deepStrictEqual(body, events);
        }).pipe(
          Effect.scoped,
          Effect.provide(makeTestLayer(commands, "success", { auditReadRecentOptions, events })),
        );
      }),
  );

  it.effect("returns audit events after the admin events cursor", () =>
    Effect.gen(function* () {
      const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([]);
      const auditReadAfterSequences = yield* Ref.make<ReadonlyArray<number>>([]);
      const events = [auditEvent(4, "https://api.example.com/v1/after")];

      return yield* Effect.gen(function* () {
        yield* HttpServer.serveEffect(
          makeHttpApp({ allowedCallerIps: [], baseUrl: "https://usher.example.com" }),
        );
        const response = yield* HttpClient.get("/events?after=3");
        const body = yield* response.json;
        const calls = yield* Ref.get(auditReadAfterSequences);

        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(calls, [3]);
        assert.deepStrictEqual(body, events);
      }).pipe(
        Effect.scoped,
        Effect.provide(makeTestLayer(commands, "success", { auditReadAfterSequences, events })),
      );
    }),
  );

  it.effect("returns a query-specific error for invalid admin events query values", () =>
    Effect.gen(function* () {
      const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([]);

      return yield* Effect.gen(function* () {
        yield* HttpServer.serveEffect(
          makeHttpApp({ allowedCallerIps: [], baseUrl: "https://usher.example.com" }),
        );
        const response = yield* HttpClient.get("/events?limit=0");
        const body = yield* response.json;

        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.headers["x-usher-error"], "true");
        assert.strictEqual(response.headers["x-usher-error-code"], "InvalidEventQueryError");
        assert.deepStrictEqual(body, {
          error: {
            code: "InvalidEventQueryError",
            message: "Event query is invalid",
          },
        });
      }).pipe(Effect.scoped, Effect.provide(makeTestLayer(commands, "success")));
    }),
  );

  it.effect("returns a query-specific error for invalid admin events cursors", () =>
    Effect.gen(function* () {
      const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([]);

      return yield* Effect.gen(function* () {
        yield* HttpServer.serveEffect(
          makeHttpApp({ allowedCallerIps: [], baseUrl: "https://usher.example.com" }),
        );
        const response = yield* HttpClient.get("/events?after=abc");
        const body = yield* response.json;

        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.headers["x-usher-error"], "true");
        assert.strictEqual(response.headers["x-usher-error-code"], "InvalidEventQueryError");
        assert.deepStrictEqual(body, {
          error: {
            code: "InvalidEventQueryError",
            message: "Event query is invalid",
          },
        });
      }).pipe(Effect.scoped, Effect.provide(makeTestLayer(commands, "success")));
    }),
  );

  it.effect("rejects admin events requests from non-loopback peers", () =>
    Effect.gen(function* () {
      const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([]);

      return yield* Effect.gen(function* () {
        yield* HttpServer.serveEffect(
          makeHttpApp({
            allowedCallerIps: [],
            baseUrl: "https://usher.example.com",
            peerAddressProvider: () => "203.0.113.10",
          }),
        );
        const response = yield* HttpClient.get("/events");
        const body = yield* response.json;

        assert.strictEqual(response.status, 403);
        assert.strictEqual(response.headers["x-usher-error"], "true");
        assert.strictEqual(response.headers["x-usher-error-code"], "CallerIpNotAllowedError");
        assert.deepStrictEqual(body, {
          error: {
            code: "CallerIpNotAllowedError",
            message: "Caller IP is not allowed",
          },
        });
      }).pipe(Effect.scoped, Effect.provide(makeTestLayer(commands, "success")));
    }),
  );

  it.effect(
    "allows OAuth2 login from non-loopback peers and uses configured base URL for redirect URI",
    () =>
      Effect.gen(function* () {
        const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([]);
        const oauthLogins = yield* Ref.make<
          ReadonlyArray<{ readonly credentialId: string; readonly redirectUri: string }>
        >([]);

        return yield* Effect.gen(function* () {
          yield* HttpServer.serveEffect(
            makeHttpApp({
              allowedCallerIps: [],
              baseUrl: "https://usher.example.com/base",
              peerAddressProvider: () => "203.0.113.10",
            }),
          );
          const response = yield* HttpClient.get(
            "/credentials/cred_0123456789abcdef/oauth2/login",
            {
              headers: { host: "attacker.example.test" },
            },
          );
          const logins = yield* Ref.get(oauthLogins);

          assert.strictEqual(response.status, 302);
          assert.strictEqual(response.headers["x-usher-error-code"], undefined);
          assert.deepStrictEqual(logins, [
            {
              credentialId: "cred_0123456789abcdef",
              redirectUri: "https://usher.example.com/oauth2/callback",
            },
          ]);
        }).pipe(Effect.scoped, Effect.provide(makeTestLayer(commands, "success", { oauthLogins })));
      }),
  );

  it.effect(
    "allows OAuth2 callback from non-loopback peers and uses configured base URL for redirect URI",
    () =>
      Effect.gen(function* () {
        const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([]);
        const oauthCallbacks = yield* Ref.make<
          ReadonlyArray<{
            readonly state: Redacted.Redacted<string>;
            readonly code: string;
            readonly redirectUri: string;
          }>
        >([]);

        return yield* Effect.gen(function* () {
          yield* HttpServer.serveEffect(
            makeHttpApp({
              allowedCallerIps: [],
              baseUrl: "https://usher.example.com/base",
              peerAddressProvider: () => "203.0.113.10",
            }),
          );
          const response = yield* HttpClient.get(
            "/oauth2/callback?state=oauth-state&code=authorization-code",
            {
              headers: { host: "attacker.example.test" },
            },
          );
          const callbacks = yield* Ref.get(oauthCallbacks);

          assert.strictEqual(response.status, 200);
          assert.strictEqual(response.headers["x-usher-error-code"], undefined);
          assert.deepStrictEqual(callbacks, [
            {
              state: Redacted.make("oauth-state"),
              code: "authorization-code",
              redirectUri: "https://usher.example.com/oauth2/callback",
            },
          ]);
        }).pipe(
          Effect.scoped,
          Effect.provide(makeTestLayer(commands, "success", { oauthCallbacks })),
        );
      }),
  );

  it.effect("forwards call method body and headers and preserves upstream status and body", () =>
    Effect.gen(function* () {
      const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([]);

      return yield* Effect.gen(function* () {
        yield* HttpServer.serveEffect(
          makeHttpApp({ allowedCallerIps: [], baseUrl: "https://usher.example.com" }),
        );
        const response = yield* HttpClientRequest.post(
          "/call?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fusers",
        ).pipe(
          HttpClientRequest.setHeader("x-correlation-id", "request-123"),
          HttpClientRequest.setHeader("user-agent", "usher-test"),
          HttpClientRequest.bodyText('{"name":"Ada"}', "application/json"),
          HttpClient.execute,
        );
        const body = yield* response.text;
        const forwarded = yield* Ref.get(commands);
        const command = forwarded[0];

        assert.strictEqual(response.status, 202);
        assert.strictEqual(response.headers["x-upstream"], "accepted");
        assert.strictEqual(body, "created");
        assert.strictEqual(command?.method, "POST");
        assert.strictEqual(command?.targetUrl, "https://api.example.com/v1/users");
        assert.strictEqual(command?.headers["x-correlation-id"], "request-123");
        assert.deepStrictEqual(command?.body, new TextEncoder().encode('{"name":"Ada"}'));
      }).pipe(Effect.scoped, Effect.provide(makeTestLayer(commands, "success")));
    }),
  );

  it.effect("logs accepted call requests as info with ordered request metadata", () =>
    Effect.gen(function* () {
      const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([]);
      const logs = yield* Ref.make<
        ReadonlyArray<{ readonly level: string; readonly message: string }>
      >([]);
      const logger = Logger.make((options) =>
        Effect.runSync(
          Ref.update(logs, (existing) => [
            ...existing,
            {
              level: String(options.logLevel.label),
              message: String(options.message),
            },
          ]),
        ),
      );

      return yield* Effect.gen(function* () {
        yield* HttpServer.serveEffect(
          makeHttpApp({
            allowedCallerIps: ["203.0.113.10"],
            baseUrl: "https://usher.example.com",
            peerAddressProvider: () => "203.0.113.10",
          }),
        );
        const response = yield* HttpClientRequest.post(
          "/call?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fusers",
        ).pipe(HttpClientRequest.setHeader("user-agent", "usher-test"), HttpClient.execute);
        const capturedLogs = yield* Ref.get(logs);

        assert.strictEqual(response.status, 202);
        assert.deepStrictEqual(capturedLogs, [
          {
            level: "INFO",
            message: "usher-test (203.0.113.10) POST https://api.example.com/v1/users",
          },
        ]);
      }).pipe(
        Effect.scoped,
        Effect.provide(makeTestLayer(commands, "success")),
        Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
        Logger.withMinimumLogLevel(LogLevel.Info),
      );
    }),
  );

  it.effect("returns usher error headers and JSON body for service errors", () =>
    Effect.gen(function* () {
      const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([]);

      return yield* Effect.gen(function* () {
        yield* HttpServer.serveEffect(
          makeHttpApp({ allowedCallerIps: [], baseUrl: "https://usher.example.com" }),
        );
        const response = yield* HttpClient.get(
          "/call?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fusers",
          {
            headers: { "user-agent": "usher-test" },
          },
        );
        const body = yield* response.json;

        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.headers["x-usher-error"], "true");
        assert.strictEqual(response.headers["x-usher-error-code"], "NoMatchingCredentialError");
        assert.deepStrictEqual(body, {
          error: {
            code: "NoMatchingCredentialError",
            message: "No matching credential found for the requested URL",
          },
        });
      }).pipe(Effect.scoped, Effect.provide(makeTestLayer(commands, "error")));
    }),
  );

  it.effect("returns usher error headers and semantic code for upstream request failures", () =>
    Effect.gen(function* () {
      const commands = yield* Ref.make<ReadonlyArray<CallCommand>>([]);

      return yield* Effect.gen(function* () {
        yield* HttpServer.serveEffect(
          makeHttpApp({ allowedCallerIps: [], baseUrl: "https://usher.example.com" }),
        );
        const response = yield* HttpClient.get(
          "/call?url=https%3A%2F%2Fapi.example.com%2Fv1%2Fusers",
          {
            headers: { "user-agent": "usher-test" },
          },
        );
        const body = yield* response.json;

        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.headers["x-usher-error"], "true");
        assert.strictEqual(response.headers["x-usher-error-code"], "UpstreamRequestFailedError");
        assert.deepStrictEqual(body, {
          error: {
            code: "UpstreamRequestFailedError",
            message: "Upstream request failed",
          },
        });
      }).pipe(Effect.scoped, Effect.provide(makeTestLayer(commands, "upstream-error")));
    }),
  );
});

function makeTestLayer(
  commands: Ref.Ref<ReadonlyArray<CallCommand>>,
  mode: "success" | "error" | "upstream-error",
  refs?: {
    readonly oauthLogins?: Ref.Ref<
      ReadonlyArray<{ readonly credentialId: string; readonly redirectUri: string }>
    >;
    readonly oauthCallbacks?: Ref.Ref<
      ReadonlyArray<{
        readonly state: Redacted.Redacted<string>;
        readonly code: string;
        readonly redirectUri: string;
      }>
    >;
    readonly auditReadRecentOptions?: Ref.Ref<ReadonlyArray<AuditEventReadOptions>>;
    readonly auditReadAfterSequences?: Ref.Ref<ReadonlyArray<number>>;
    readonly events?: ReadonlyArray<AuditEvent>;
  },
) {
  const oauthLogins = refs?.oauthLogins;
  const oauthCallbacks = refs?.oauthCallbacks;
  const auditReadRecentOptions = refs?.auditReadRecentOptions;
  const auditReadAfterSequences = refs?.auditReadAfterSequences;
  const events = refs?.events ?? [];

  return Layer.mergeAll(
    Layer.succeed(CallService, {
      call: (command) => call(commands, mode, command),
      execute: (command) => call(commands, mode, command),
    }),
    Layer.succeed(CredentialService, {
      create: () => Effect.die("unused"),
      list: () => Effect.die("unused"),
      getById: () => Effect.die("unused"),
      deleteById: () => Effect.die("unused"),
    }),
    Layer.succeed(OAuth2Service, {
      buildLoginUrl: (input) =>
        Effect.gen(function* () {
          if (oauthLogins !== undefined) {
            yield* Ref.update(oauthLogins, (existing) => [
              ...existing,
              {
                credentialId: input.credentialId,
                redirectUri: input.redirectUri,
              },
            ]);
          }

          return "https://provider.example.com/authorize";
        }),
      handleCallback: (input) =>
        Effect.gen(function* () {
          if (oauthCallbacks !== undefined) {
            yield* Ref.update(oauthCallbacks, (existing) => [
              ...existing,
              {
                state: input.state,
                code: input.code,
                redirectUri: input.redirectUri,
              },
            ]);
          }
        }),
    }),
    Layer.succeed(AuditLog, {
      record: () => Effect.die("unused"),
      readRecent: (options) =>
        Effect.gen(function* () {
          if (auditReadRecentOptions !== undefined) {
            yield* Ref.update(auditReadRecentOptions, (existing) => [...existing, options]);
          }

          return events;
        }),
      readAfter: (sequence) =>
        Effect.gen(function* () {
          if (auditReadAfterSequences !== undefined) {
            yield* Ref.update(auditReadAfterSequences, (existing) => [...existing, sequence]);
          }

          return events;
        }),
    }),
    NodeHttpServer.layerTest,
  );
}

function auditEvent(sequence: number, targetUrl: string): AuditEvent {
  return {
    sequence,
    event: "OutboundCallCompleted",
    timestamp: "2026-05-27T00:00:00.000Z",
    sourceIp: "203.0.113.10",
    userAgent: "usher-test/1.0",
    method: "GET",
    targetUrl,
    outcome: "allowed",
  };
}

function call(
  commands: Ref.Ref<ReadonlyArray<CallCommand>>,
  mode: "success" | "error" | "upstream-error",
  command: CallCommand,
) {
  return Effect.gen(function* () {
    yield* Ref.update(commands, (existing) => [...existing, command]);
    if (mode === "error") {
      return yield* Effect.fail(NoMatchingCredentialError.make());
    }
    if (mode === "upstream-error") {
      return yield* Effect.fail(UpstreamRequestFailedError.make());
    }

    return {
      status: 202,
      headers: { "x-upstream": "accepted" },
      body: "created",
    };
  });
}
