import { Error as PlatformError, FileSystem } from "@effect/platform";
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { ConfigError, ConfigProvider, Effect, Layer, Sink, Stream } from "effect";
import { DefaultUsherPort, loadUsherConfig } from "./UsherConfig.js";

describe("UsherConfig", () => {
  it.effect("loads daemon config from the default user config file", () =>
    Effect.gen(function* () {
      const config = yield* loadUsherConfig.pipe(
        Effect.provide(Layer.succeed(FileSystem.FileSystem, makeConfigFileSystem())),
        Effect.withConfigProvider(ConfigProvider.fromMap(new Map([["HOME", "/home/alice"]]))),
      );

      assert.strictEqual(config.databasePath, "/home/alice/.config/usher/usher.sqlite");
      assert.strictEqual(config.encryptionKeyFile, "/home/alice/.config/usher/encryption.key");
      assert.strictEqual(config.baseUrl, "http://localhost:3000");
      assert.deepStrictEqual(config.allowedCallerIps, ["127.0.0.1", "::1"]);
      assert.strictEqual(config.port, 3000);
    }),
  );

  it.effect("reads daemon config from the default user config path", () =>
    Effect.gen(function* () {
      yield* loadUsherConfig.pipe(
        Effect.provide(
          Layer.succeed(
            FileSystem.FileSystem,
            makeConfigFileSystem(defaultConfig(), "/home/alice/.config/usher/config.json"),
          ),
        ),
        Effect.withConfigProvider(ConfigProvider.fromMap(new Map([["HOME", "/home/alice"]]))),
      );
    }),
  );

  it.effect("rejects invalid file config ports", () =>
    Effect.gen(function* () {
      for (const port of [-1, 0, 1.5, 70000]) {
        const error = yield* loadUsherConfig.pipe(
          Effect.provide(
            Layer.succeed(
              FileSystem.FileSystem,
              makeConfigFileSystem({
                ...defaultConfig(),
                port,
              }),
            ),
          ),
          Effect.withConfigProvider(ConfigProvider.fromMap(new Map([["HOME", "/home/alice"]]))),
          Effect.flip,
        );

        assert.assertTrue(ConfigError.isConfigError(error));
        assert.assertTrue(formatConfigError(error).includes("port"));
        assert.assertTrue(formatConfigError(error).includes("config.json"));
      }
    }),
  );

  it.effect("reports invalid JSON config files as configuration errors", () =>
    Effect.gen(function* () {
      const error = yield* loadUsherConfig.pipe(
        Effect.provide(Layer.succeed(FileSystem.FileSystem, makeRawConfigFileSystem("{"))),
        Effect.withConfigProvider(ConfigProvider.fromMap(new Map([["HOME", "/home/alice"]]))),
        Effect.flip,
      );

      assert.assertTrue(ConfigError.isConfigError(error));
      assert.assertTrue(formatConfigError(error).includes("config.json"));
    }),
  );

  it.effect("reports unavailable config files as source configuration errors", () =>
    Effect.gen(function* () {
      const error = yield* loadUsherConfig.pipe(
        Effect.provide(Layer.succeed(FileSystem.FileSystem, makeUnreadableConfigFileSystem())),
        Effect.withConfigProvider(ConfigProvider.fromMap(new Map([["HOME", "/home/alice"]]))),
        Effect.flip,
      );

      assert.assertTrue(ConfigError.isConfigError(error));
      assert.assertTrue(formatConfigError(error).includes("unavailable"));
      assert.assertTrue(formatConfigError(error).includes("config.json"));
    }),
  );

  it.effect("fails when required file configuration is missing", () =>
    Effect.gen(function* () {
      const error = yield* loadUsherConfig.pipe(
        Effect.provide(
          Layer.succeed(
            FileSystem.FileSystem,
            makeConfigFileSystem({
              encryptionKeyFile: "/home/alice/.config/usher/encryption.key",
              baseUrl: "http://localhost:3000",
              allowedCallerIps: ["127.0.0.1", "::1"],
            }),
          ),
        ),
        Effect.withConfigProvider(ConfigProvider.fromMap(new Map([["HOME", "/home/alice"]]))),
        Effect.flip,
      );

      assert.assertTrue(ConfigError.isConfigError(error));
      assert.assertTrue(formatConfigError(error).includes("databasePath"));
      assert.assertTrue(formatConfigError(error).includes("config.json"));
    }),
  );

  it.effect("defaults the daemon port to 3000 when config file and env omit it", () =>
    Effect.gen(function* () {
      const config = yield* loadUsherConfig.pipe(
        Effect.provide(
          Layer.succeed(
            FileSystem.FileSystem,
            makeConfigFileSystem({
              databasePath: "/home/alice/.config/usher/usher.sqlite",
              encryptionKeyFile: "/home/alice/.config/usher/encryption.key",
              baseUrl: "http://localhost:3000",
              allowedCallerIps: ["127.0.0.1", "::1"],
            }),
          ),
        ),
        Effect.withConfigProvider(ConfigProvider.fromMap(new Map([["HOME", "/home/alice"]]))),
      );

      assert.strictEqual(DefaultUsherPort, 3000);
      assert.strictEqual(config.port, 3000);
    }),
  );

  it.effect("applies environment overrides after reading the config file", () =>
    Effect.gen(function* () {
      const config = yield* loadUsherConfig.pipe(
        Effect.provide(Layer.succeed(FileSystem.FileSystem, makeConfigFileSystem())),
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["HOME", "/home/alice"],
              ["USHER_DATABASE_PATH", "/tmp/usher.sqlite"],
              ["USHER_ENCRYPTION_KEY_FILE", "/tmp/encryption.key"],
              ["USHER_BASE_URL", "https://usher.example.com"],
              ["USHER_ALLOWED_CALLER_IPS", "10.0.0.1, 10.0.0.2"],
              ["USHER_PORT", "3131"],
            ]),
          ),
        ),
      );

      assert.strictEqual(config.databasePath, "/tmp/usher.sqlite");
      assert.strictEqual(config.encryptionKeyFile, "/tmp/encryption.key");
      assert.strictEqual(config.baseUrl, "https://usher.example.com");
      assert.deepStrictEqual(config.allowedCallerIps, ["10.0.0.1", "10.0.0.2"]);
      assert.strictEqual(config.port, 3131);
    }),
  );

  it.effect("drops blank entries from USHER_ALLOWED_CALLER_IPS", () =>
    Effect.gen(function* () {
      const config = yield* loadUsherConfig.pipe(
        Effect.provide(Layer.succeed(FileSystem.FileSystem, makeConfigFileSystem())),
        Effect.withConfigProvider(
          ConfigProvider.fromMap(
            new Map([
              ["HOME", "/home/alice"],
              ["USHER_ALLOWED_CALLER_IPS", "127.0.0.1, , ::1,"],
            ]),
          ),
        ),
      );

      assert.deepStrictEqual(config.allowedCallerIps, ["127.0.0.1", "::1"]);
    }),
  );
});

function makeConfigFileSystem(
  config: unknown = defaultConfig(),
  expectedPath?: string,
): FileSystem.FileSystem {
  return makeRawConfigFileSystem(JSON.stringify(config), expectedPath);
}

function makeRawConfigFileSystem(configText: string, expectedPath?: string): FileSystem.FileSystem {
  const unsupported = Effect.die("unsupported filesystem operation");

  return {
    access: () => unsupported,
    copy: () => unsupported,
    copyFile: () => unsupported,
    chmod: () => unsupported,
    chown: () => unsupported,
    exists: () => unsupported,
    link: () => unsupported,
    makeDirectory: () => unsupported,
    makeTempDirectory: () => unsupported,
    makeTempDirectoryScoped: () => unsupported,
    makeTempFile: () => unsupported,
    makeTempFileScoped: () => unsupported,
    open: () => unsupported,
    readDirectory: () => unsupported,
    readFile: () => unsupported,
    readFileString: (path) =>
      Effect.sync(() => {
        if (expectedPath !== undefined) {
          assert.strictEqual(path, expectedPath);
        }

        return configText;
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
    writeFileString: () => unsupported,
  };
}

function makeUnreadableConfigFileSystem(): FileSystem.FileSystem {
  const configPath = "/home/alice/.config/usher/config.json";

  return {
    ...makeRawConfigFileSystem("", configPath),
    readFileString: (path) =>
      Effect.sync(() => {
        assert.strictEqual(path, configPath);
      }).pipe(
        Effect.flatMap(() =>
          Effect.fail(
            PlatformError.SystemError.make({
              reason: "NotFound",
              module: "FileSystem",
              method: "readFileString",
              pathOrDescriptor: configPath,
              description: "config file missing",
            }),
          ),
        ),
      ),
  };
}

function formatConfigError(error: ConfigError.ConfigError) {
  const reducer: ConfigError.ConfigErrorReducer<undefined, string> = {
    andCase: (_context, left, right) => `${left}; ${right}`,
    invalidDataCase: (_context, path, message) => `invalid ${path.join(".")}: ${message}`,
    missingDataCase: (_context, path, message) => `missing ${path.join(".")}: ${message}`,
    orCase: (_context, left, right) => `${left}; ${right}`,
    sourceUnavailableCase: (_context, path, message) => `unavailable ${path.join(".")}: ${message}`,
    unsupportedCase: (_context, path, message) => `unsupported ${path.join(".")}: ${message}`,
  };

  return ConfigError.reduceWithContext(error, undefined, reducer);
}

function defaultConfig() {
  return {
    databasePath: "/home/alice/.config/usher/usher.sqlite",
    encryptionKeyFile: "/home/alice/.config/usher/encryption.key",
    baseUrl: "http://localhost:3000",
    allowedCallerIps: ["127.0.0.1", "::1"],
    port: 3000,
  };
}
