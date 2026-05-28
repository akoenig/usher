import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect } from "effect";
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
});
