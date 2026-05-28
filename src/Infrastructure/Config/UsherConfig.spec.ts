import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { ConfigProvider, Effect } from "effect";
import { DefaultUsherPort, loadUsherConfig } from "./UsherConfig.js";

describe("UsherConfig", () => {
  it.effect("defaults the daemon port to 3000 when USHER_PORT is missing", () =>
    Effect.gen(function* () {
      const config = yield* loadUsherConfig.pipe(
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["USHER_DATABASE_PATH", ".usher/usher.sqlite"],
              ["USHER_ENCRYPTION_KEY_FILE", ".usher/encryption.key"],
              ["USHER_BASE_URL", "http://localhost:3000"],
              ["USHER_ALLOWED_CALLER_IPS", "127.0.0.1,::1"],
            ]),
          ),
        ),
      );

      assert.strictEqual(DefaultUsherPort, 3000);
      assert.strictEqual(config.port, 3000);
    }),
  );
});
