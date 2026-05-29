import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect, Schema } from "effect";

const PackageJson = Schema.Struct({
  bin: Schema.Struct({
    usher: Schema.String,
  }),
  files: Schema.Array(Schema.String),
});

describe("Main", () => {
  it.effect("does not include a shebang in the TypeScript application entrypoint", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const source = yield* fs.readFileString("src/Main.ts");

      assert.assertFalse(source.startsWith("#!"));
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );

  it.effect("publishes the usher binary from bin/usher", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const source = yield* fs.readFileString("package.json");
      const packageJson = yield* Schema.decodeUnknown(PackageJson)(JSON.parse(source));

      assert.strictEqual(packageJson.bin.usher, "bin/usher");
      assert.deepStrictEqual(packageJson.files, ["bin", "dist", "README.md"]);
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );

  it.effect("provides a bash wrapper that honors USHER_NODE and forwards arguments", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const source = yield* fs.readFileString("bin/usher");

      assert.assertTrue(source.startsWith("#!/usr/bin/env bash\n"));
      assert.assertTrue(source.includes("set -euo pipefail"));
      assert.assertTrue(source.includes("ROOT=\"$(cd \"$SCRIPT_DIR/..\" && pwd)\""));
      assert.assertTrue(
        source.includes('exec "${USHER_NODE:-node}" "$ROOT/dist/Main.mjs" "$@"'),
      );
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
});
