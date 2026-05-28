import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { localAdminBaseUrl } from "./CliConfig.js";

describe("CliConfig", () => {
  it("builds a loopback admin base URL from the configured port", () => {
    assert.strictEqual(localAdminBaseUrl(3000), "http://127.0.0.1:3000");
  });
});
