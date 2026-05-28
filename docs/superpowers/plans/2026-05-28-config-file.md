# Config File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load Usher daemon configuration from `~/.config/usher/config.json`, with existing `USHER_*` environment variables available as overrides.

**Architecture:** Keep daemon configuration in `src/Infrastructure/Config/UsherConfig.ts`. Add small pure helpers for default paths, JSON decoding, env override application, and comma-separated IP parsing; `loadUsherConfig` remains the daemon entry point consumed by `runUsherDaemon`. README setup moves from `.usher` and required env exports to `~/.config/usher/config.json` plus optional env overrides.

**Tech Stack:** TypeScript, Effect, Effect Schema, Effect Config, Effect Platform FileSystem, `@effect/vitest`, Vite+ via `vp`.

---

## File Structure

- Modify: `src/Infrastructure/Config/UsherConfig.ts`
  - Owns daemon config schema, default config path construction, JSON file loading, environment override parsing, and final schema decoding.
- Modify: `src/Infrastructure/Config/UsherConfig.spec.ts`
  - Covers config file loading, port defaulting, env overrides, comma-separated allowed caller IP parsing, and invalid config failures.
- Modify: `src/Infrastructure/Cli/UsherCli.spec.ts`
  - Updates stale assertion that mentions old env-only required daemon config.
- Modify: `README.md`
  - Documents `~/.config/usher/config.json`, safe key-file creation, and optional env overrides.

## Task 1: Load Daemon Config From JSON File

**Files:**
- Modify: `src/Infrastructure/Config/UsherConfig.ts`
- Test: `src/Infrastructure/Config/UsherConfig.spec.ts`

- [ ] **Step 1: Replace the existing config spec with file-loading tests**

Replace `src/Infrastructure/Config/UsherConfig.spec.ts` with:

```ts
import { FileSystem } from "@effect/platform";
import { describe, it } from "@effect/vitest";
import * as assert from "@effect/vitest/utils";
import { ConfigProvider, Effect, Exit, Layer, Sink, Stream } from "effect";
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
});

function makeConfigFileSystem(config: unknown = defaultConfig()): FileSystem.FileSystem {
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
    readFileString: () => Effect.succeed(JSON.stringify(config)),
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

function defaultConfig() {
  return {
    databasePath: "/home/alice/.config/usher/usher.sqlite",
    encryptionKeyFile: "/home/alice/.config/usher/encryption.key",
    baseUrl: "http://localhost:3000",
    allowedCallerIps: ["127.0.0.1", "::1"],
    port: 3000,
  };
}
```

- [ ] **Step 2: Run the config specs to verify they fail**

Run: `vp test src/Infrastructure/Config/UsherConfig.spec.ts`

Expected: FAIL because `loadUsherConfig` still reads required `USHER_*` env config and does not require `FileSystem.FileSystem`.

- [ ] **Step 3: Implement JSON file loading with optional port default**

Replace `src/Infrastructure/Config/UsherConfig.ts` with:

```ts
import { FileSystem } from "@effect/platform";
import { Config, Effect, Schema } from "effect";

export const DefaultUsherPort = 3000;

export const UsherConfig = Schema.Struct({
  databasePath: Schema.NonEmptyString,
  encryptionKeyFile: Schema.NonEmptyString,
  baseUrl: Schema.NonEmptyString,
  allowedCallerIps: Schema.Array(Schema.String),
  port: Schema.Number,
});
export type UsherConfig = Schema.Schema.Type<typeof UsherConfig>;

const UsherConfigFile = Schema.Struct({
  databasePath: Schema.NonEmptyString,
  encryptionKeyFile: Schema.NonEmptyString,
  baseUrl: Schema.NonEmptyString,
  allowedCallerIps: Schema.Array(Schema.String),
  port: Schema.optional(Schema.Number),
});

export function defaultUsherConfigPath(homeDirectory: string) {
  return `${homeDirectory}/.config/usher/config.json`;
}

export const loadUsherConfig = Effect.gen(function* () {
  const homeDirectory = yield* Config.nonEmptyString("HOME");
  const fs = yield* FileSystem.FileSystem;
  const configText = yield* fs.readFileString(defaultUsherConfigPath(homeDirectory));
  const fileConfig = yield* Schema.decodeUnknown(UsherConfigFile)(JSON.parse(configText));

  return yield* Schema.decodeUnknown(UsherConfig)({
    ...fileConfig,
    port: fileConfig.port ?? DefaultUsherPort,
  });
});
```

- [ ] **Step 4: Run the config specs to verify they pass**

Run: `vp test src/Infrastructure/Config/UsherConfig.spec.ts`

Expected: PASS for the two file-loading tests.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS. If Effect error types need adjustment, keep the public `loadUsherConfig` name and use Effect helpers instead of type casts.

## Task 2: Apply Environment Overrides

**Files:**
- Modify: `src/Infrastructure/Config/UsherConfig.ts`
- Test: `src/Infrastructure/Config/UsherConfig.spec.ts`

- [ ] **Step 1: Add env override tests**

Append these tests inside the existing `describe("UsherConfig", () => { ... })` block in `src/Infrastructure/Config/UsherConfig.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run the config specs to verify override tests fail**

Run: `vp test src/Infrastructure/Config/UsherConfig.spec.ts`

Expected: FAIL because env overrides are not applied yet.

- [ ] **Step 3: Implement env override parsing and merging**

Update `src/Infrastructure/Config/UsherConfig.ts` so the full file is:

```ts
import { FileSystem } from "@effect/platform";
import { Config, Effect, Option, Schema } from "effect";

export const DefaultUsherPort = 3000;

export const UsherConfig = Schema.Struct({
  databasePath: Schema.NonEmptyString,
  encryptionKeyFile: Schema.NonEmptyString,
  baseUrl: Schema.NonEmptyString,
  allowedCallerIps: Schema.Array(Schema.String),
  port: Schema.Number,
});
export type UsherConfig = Schema.Schema.Type<typeof UsherConfig>;

const UsherConfigFile = Schema.Struct({
  databasePath: Schema.NonEmptyString,
  encryptionKeyFile: Schema.NonEmptyString,
  baseUrl: Schema.NonEmptyString,
  allowedCallerIps: Schema.Array(Schema.String),
  port: Schema.optional(Schema.Number),
});

const UsherConfigEnvironment = Schema.Struct({
  databasePath: Schema.optional(Schema.NonEmptyString),
  encryptionKeyFile: Schema.optional(Schema.NonEmptyString),
  baseUrl: Schema.optional(Schema.NonEmptyString),
  allowedCallerIps: Schema.optional(Schema.Array(Schema.String)),
  port: Schema.optional(Schema.Number),
});

type UsherConfigFile = Schema.Schema.Type<typeof UsherConfigFile>;
type UsherConfigEnvironment = Schema.Schema.Type<typeof UsherConfigEnvironment>;

export function defaultUsherConfigPath(homeDirectory: string) {
  return `${homeDirectory}/.config/usher/config.json`;
}

export const loadUsherConfig = Effect.gen(function* () {
  const homeDirectory = yield* Config.nonEmptyString("HOME");
  const fs = yield* FileSystem.FileSystem;
  const configText = yield* fs.readFileString(defaultUsherConfigPath(homeDirectory));
  const fileConfig = yield* decodeConfigFile(configText);
  const environmentConfig = yield* loadEnvironmentConfig;

  return yield* Schema.decodeUnknown(UsherConfig)(mergeConfig(fileConfig, environmentConfig));
});

const loadEnvironmentConfig = Config.all({
  databasePath: Config.option(Config.nonEmptyString("USHER_DATABASE_PATH")),
  encryptionKeyFile: Config.option(Config.nonEmptyString("USHER_ENCRYPTION_KEY_FILE")),
  baseUrl: Config.option(Config.nonEmptyString("USHER_BASE_URL")),
  allowedCallerIps: Config.option(
    Config.string("USHER_ALLOWED_CALLER_IPS").pipe(Config.map(parseAllowedCallerIps)),
  ),
  port: Config.option(Config.port("USHER_PORT")),
}).pipe(
  Effect.map((config) => ({
    databasePath: Option.getOrUndefined(config.databasePath),
    encryptionKeyFile: Option.getOrUndefined(config.encryptionKeyFile),
    baseUrl: Option.getOrUndefined(config.baseUrl),
    allowedCallerIps: Option.getOrUndefined(config.allowedCallerIps),
    port: Option.getOrUndefined(config.port),
  })),
  Effect.flatMap(Schema.decodeUnknown(UsherConfigEnvironment)),
);

function decodeConfigFile(configText: string) {
  return Effect.try({
    try: () => JSON.parse(configText),
    catch: (error) => error,
  }).pipe(Effect.flatMap(Schema.decodeUnknown(UsherConfigFile)));
}

function mergeConfig(
  fileConfig: UsherConfigFile,
  environmentConfig: UsherConfigEnvironment,
): UsherConfig {
  return {
    databasePath: environmentConfig.databasePath ?? fileConfig.databasePath,
    encryptionKeyFile: environmentConfig.encryptionKeyFile ?? fileConfig.encryptionKeyFile,
    baseUrl: environmentConfig.baseUrl ?? fileConfig.baseUrl,
    allowedCallerIps: environmentConfig.allowedCallerIps ?? fileConfig.allowedCallerIps,
    port: environmentConfig.port ?? fileConfig.port ?? DefaultUsherPort,
  };
}

function parseAllowedCallerIps(value: string) {
  return value
    .split(",")
    .map((ip) => ip.trim())
    .filter((ip) => ip !== "");
}
```

- [ ] **Step 4: Run the config specs to verify they pass**

Run: `vp test src/Infrastructure/Config/UsherConfig.spec.ts`

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS. If `JSON.parse` error typing causes issues, keep it as `unknown` and let Effect carry it rather than adding type casts.

## Task 3: Cover Invalid Config and Operator Error Text

**Files:**
- Modify: `src/Infrastructure/Config/UsherConfig.spec.ts`
- Modify: `src/Infrastructure/Cli/UsherCli.spec.ts`

- [ ] **Step 1: Add invalid config failure test**

Append this test inside `describe("UsherConfig", () => { ... })` in `src/Infrastructure/Config/UsherConfig.spec.ts`:

```ts
  it.effect("fails when required file configuration is missing", () =>
    Effect.gen(function* () {
      const result = yield* loadUsherConfig.pipe(
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
        Effect.exit,
      );

      assert.assertTrue(Exit.isFailure(result));
    }),
  );
```

- [ ] **Step 2: Update stale CLI config error assertion**

In `src/Infrastructure/Cli/UsherCli.spec.ts`, replace the existing missing env test body:

```ts
  it("formats missing configuration errors for operators", () => {
    const message = formatConfigErrorMessage(
      ConfigError.MissingData(["USHER_DATABASE_PATH"], "Expected USHER_DATABASE_PATH to exist"),
    );

    assert.assertTrue(message.includes("Daemon configuration invalid."));
    assert.assertTrue(message.includes("USHER_DATABASE_PATH"));
  });
```

with:

```ts
  it("formats missing configuration errors for operators", () => {
    const message = formatConfigErrorMessage(
      ConfigError.MissingData(
        ["HOME"],
        "Expected HOME to exist for ~/.config/usher/config.json",
      ),
    );

    assert.assertTrue(message.includes("Daemon configuration invalid."));
    assert.assertTrue(message.includes("HOME"));
  });
```

- [ ] **Step 3: Run focused tests**

Run: `vp test src/Infrastructure/Config/UsherConfig.spec.ts src/Infrastructure/Cli/UsherCli.spec.ts`

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

## Task 4: Update README Configuration Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace Configure section**

In `README.md`, replace lines from `## Configure` through the paragraph ending with `makes existing encrypted credential material unreadable.` with:

```md
## Configure

Create the standard Usher config directory and encryption key:

```sh
mkdir -p ~/.config/usher
touch ~/.config/usher/encryption.key
chmod 600 ~/.config/usher/encryption.key
node -e "console.log('base64url:' + require('node:crypto').randomBytes(32).toString('base64url'))" > ~/.config/usher/encryption.key
```

Create `~/.config/usher/config.json`:

```json
{
  "databasePath": "/home/alice/.config/usher/usher.sqlite",
  "encryptionKeyFile": "/home/alice/.config/usher/encryption.key",
  "baseUrl": "http://localhost:3000",
  "allowedCallerIps": ["127.0.0.1", "::1"],
  "port": 3000
}
```

Replace `/home/alice` with your home directory. `port` is optional and defaults to `3000`.

The daemon reads all required configuration from this file. Environment variables with the same names as earlier releases may still be used as overrides when present:

```text
USHER_DATABASE_PATH
USHER_ENCRYPTION_KEY_FILE
USHER_BASE_URL
USHER_ALLOWED_CALLER_IPS
USHER_PORT
```

`USHER_ALLOWED_CALLER_IPS` is comma-separated when set as an environment variable, for example `127.0.0.1,::1`.

The encryption key file must contain exactly one line:

```text
base64url:<32-byte random key encoded as base64url>
```

The file must be owned by the process user and use `0400` or `0600` permissions. Generate it once and keep it with the database. Stored credential secrets are encrypted with this key; replacing or deleting it makes existing encrypted credential material unreadable.
```

- [ ] **Step 2: Update Safety Model configuration references**

In `README.md`, replace:

```md
- `/call` is restricted by `USHER_ALLOWED_CALLER_IPS`.
- Stored credential secrets are encrypted with the configured key file.
```

with:

```md
- `/call` is restricted by `allowedCallerIps` from `~/.config/usher/config.json` or `USHER_ALLOWED_CALLER_IPS`.
- Stored credential secrets are encrypted with the configured key file.
```

- [ ] **Step 3: Replace Quick Reference configuration block**

In `README.md`, replace the `Required configuration:` and `Optional configuration:` blocks with:

```md
Configuration file:

```text
~/.config/usher/config.json
```

Required JSON fields:

```text
databasePath
encryptionKeyFile
baseUrl
allowedCallerIps
```

Optional JSON fields:

```text
port=3000
```

Environment variables with matching names from earlier releases remain optional overrides.
```

- [ ] **Step 4: Search README for stale `.usher` setup paths**

Run: `rg '\.usher|Set the required environment variables|USHER_DATABASE_PATH' README.md`

Expected: no `.usher` matches and only intentional optional-override `USHER_*` references remain.

## Task 5: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 2: Run focused tests**

Run: `vp test src/Infrastructure/Config/UsherConfig.spec.ts src/Infrastructure/Cli/UsherCli.spec.ts`

Expected: PASS.

- [ ] **Step 3: Run full tests**

Run: `vp test`

Expected: PASS.

- [ ] **Step 4: Run full check**

Run: `vp check`

Expected: PASS. If formatting changes are reported, apply the formatter through Vite+ tooling and rerun `vp check`.

- [ ] **Step 5: Inspect changed files**

Run: `git diff -- src/Infrastructure/Config/UsherConfig.ts src/Infrastructure/Config/UsherConfig.spec.ts src/Infrastructure/Cli/UsherCli.spec.ts README.md docs/superpowers/specs/2026-05-28-config-file-design.md docs/superpowers/plans/2026-05-28-config-file.md`

Expected: Diff includes only the config-file design, implementation, tests, and README updates. No files under `@repos/` are modified.
