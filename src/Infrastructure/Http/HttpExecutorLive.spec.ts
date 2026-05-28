import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect, Redacted } from "effect";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { HttpExecutor } from "../../Application/Ports/HttpExecutor.js";
import { UpstreamRequestFailedError } from "../../Domain/Errors/UsherErrors.js";
import { HttpExecutorLive } from "./HttpExecutorLive.js";

describe("HttpExecutorLive", () => {
  it.effect("converts fetch failures to semantic upstream request failures", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            const executor = yield* HttpExecutor;

            return yield* executor.execute({
              method: "GET",
              url: "http://127.0.0.1:1/unreachable",
              headers: {},
            });
          }),
          HttpExecutorLive,
        ),
      );

      assert.assertInstanceOf(error, UpstreamRequestFailedError);
    }),
  );

  it.scoped("formats structured bearer authorization header at the fetch boundary", () =>
    Effect.gen(function* () {
      const upstream = yield* startUpstreamServer();
      const response = yield* Effect.provide(
        Effect.gen(function* () {
          const executor = yield* HttpExecutor;

          return yield* executor.execute({
            method: "GET",
            url: upstream.url,
            headers: {
              Authorization: { scheme: "Bearer", token: Redacted.make("super-secret-token") },
            },
          });
        }),
        HttpExecutorLive,
      );
      const received = upstream.received[0];

      assert.strictEqual(response.status, 204);
      assert.strictEqual(received?.authorization, "Bearer super-secret-token");
    }),
  );
});

function startUpstreamServer() {
  return Effect.acquireRelease(
    Effect.async<
      {
        readonly url: string;
        readonly received: Array<{ readonly authorization: string | undefined }>;
        readonly server: ReturnType<typeof createServer>;
      },
      unknown
    >((resume) => {
      const received: Array<{ readonly authorization: string | undefined }> = [];
      const server = createServer((request, response) => {
        received.push({ authorization: headerValue(request.headers, "authorization") });
        response.writeHead(204);
        response.end();
      });

      server.once("error", (error) => resume(Effect.fail(error)));
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (isAddressInfo(address)) {
          resume(
            Effect.succeed({
              url: `http://127.0.0.1:${address.port}/resource`,
              received,
              server,
            }),
          );
        } else {
          resume(Effect.fail(new Error("Upstream server did not bind to a TCP port")));
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

function headerValue(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name];

  return Array.isArray(value) ? value.join(", ") : value;
}

function isAddressInfo(address: AddressInfo | string | null): address is AddressInfo {
  return typeof address === "object" && address !== null;
}
