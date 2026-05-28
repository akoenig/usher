import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { ConfigProvider, Effect } from "effect";
import { loadUsherCliConfig, localAdminBaseUrl } from "./CliConfig.js";

describe("CliConfig", () => {
  it("builds a loopback admin base URL from the configured port", () => {
    assert.strictEqual(localAdminBaseUrl(3000), "http://127.0.0.1:3000");
  });

  it.effect("defaults the CLI admin port to 3000 when USHER_PORT is missing", () =>
    Effect.gen(function* () {
      const config = yield* loadUsherCliConfig.pipe(
        Effect.withConfigProvider(ConfigProvider.fromMap(new Map())),
      );

      assert.strictEqual(config.port, 3000);
    }),
  );
});
