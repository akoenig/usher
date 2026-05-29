import { FileSystem } from "@effect/platform";
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { Effect, Either, Layer, Sink, Stream } from "effect";
import { DefaultUsherPort } from "../Config/UsherConfig.js";
import { initializeUsherConfig, renderInitialUsherConfig } from "./InitConfig.js";

describe("InitConfig", () => {
  it("renders the initial daemon config", () => {
    assert.strictEqual(
      renderInitialUsherConfig({
        homeDirectory: "/home/alice",
        encryptionKey: "base64url:key-value",
      }),
      [
        "{",
        '  "databasePath": "/home/alice/.config/usher/usher.sqlite",',
        '  "encryptionKey": "base64url:key-value",',
        '  "baseUrl": "http://localhost:3000",',
        '  "allowedCallerIps": ["127.0.0.1", "::1"],',
        `  "port": ${DefaultUsherPort}`,
        "}",
        "",
      ].join("\n"),
    );
  });

  it.effect("creates config.json with 0600 permissions", () =>
    Effect.gen(function* () {
      const events: Array<string> = [];

      yield* initializeUsherConfig({
        homeDirectory: "/home/alice",
        generateEncryptionKey: Effect.succeed("base64url:key-value"),
      }).pipe(Effect.provide(Layer.succeed(FileSystem.FileSystem, makeFileSystem(events, false))));

      assert.deepStrictEqual(events.slice(0, 4), [
        "mkdir:/home/alice/.config/usher:true",
        "exists:/home/alice/.config/usher/config.json",
        "write:/home/alice/.config/usher/config.json:",
        "chmod:/home/alice/.config/usher/config.json:384",
      ]);
      assert.assertTrue(events[4]?.includes('"encryptionKey": "base64url:key-value"'));
    }),
  );

  it.effect("generates an encryption key when no test generator is supplied", () =>
    Effect.gen(function* () {
      const events: Array<string> = [];

      yield* initializeUsherConfig({ homeDirectory: "/home/alice" }).pipe(
        Effect.provide(Layer.succeed(FileSystem.FileSystem, makeFileSystem(events, false))),
      );

      assert.assertTrue(events.some((event) => event.includes('"encryptionKey": "base64url:')));
    }),
  );

  it.effect("refuses to overwrite an existing non-empty config", () =>
    Effect.gen(function* () {
      const events: Array<string> = [];
      const result = yield* initializeUsherConfig({
        homeDirectory: "/home/alice",
        generateEncryptionKey: Effect.succeed("base64url:key-value"),
      }).pipe(
        Effect.provide(Layer.succeed(FileSystem.FileSystem, makeFileSystem(events, true))),
        Effect.either,
      );

      assert.assertTrue(Either.isLeft(result));
      assert.deepStrictEqual(events, [
        "mkdir:/home/alice/.config/usher:true",
        "exists:/home/alice/.config/usher/config.json",
        "read:/home/alice/.config/usher/config.json",
      ]);
    }),
  );
});

function makeFileSystem(events: Array<string>, existingNonEmpty: boolean): FileSystem.FileSystem {
  const unsupported = Effect.die("unsupported filesystem operation");

  return {
    access: () => unsupported,
    copy: () => unsupported,
    copyFile: () => unsupported,
    chmod: (path, mode) =>
      Effect.sync(() => {
        events.push(`chmod:${path}:${mode}`);
      }),
    chown: () => unsupported,
    exists: (path) =>
      Effect.sync(() => {
        events.push(`exists:${path}`);

        return existingNonEmpty;
      }),
    link: () => unsupported,
    makeDirectory: (path, options) =>
      Effect.sync(() => {
        events.push(`mkdir:${path}:${options?.recursive === true}`);
      }),
    makeTempDirectory: () => unsupported,
    makeTempDirectoryScoped: () => unsupported,
    makeTempFile: () => unsupported,
    makeTempFileScoped: () => unsupported,
    open: () => unsupported,
    readDirectory: () => unsupported,
    readFile: () => unsupported,
    readFileString: (path) =>
      Effect.sync(() => {
        events.push(`read:${path}`);

        return existingNonEmpty ? "existing" : "";
      }),
    readLink: () => unsupported,
    realPath: () => unsupported,
    remove: () => unsupported,
    rename: () => unsupported,
    sink: () => Sink.drain,
    stat: () => unsupported,
    stream: () => Stream.empty,
    symlink: () => unsupported,
    truncate: () => unsupported,
    utimes: () => unsupported,
    watch: () => Stream.empty,
    writeFile: () => unsupported,
    writeFileString: (path, content) =>
      Effect.sync(() => {
        events.push(`write:${path}:${content}`);
      }),
  };
}
