import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect } from "effect";

describe("Main", () => {
  it.effect("starts with a Node shebang so installed binaries can be executed directly", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const source = yield* fs.readFileString("src/Main.ts");

      assert.assertTrue(source.startsWith("#!/usr/bin/env node\n"));
    }).pipe(Effect.provide(NodeFileSystem.layer)),
  );
});
