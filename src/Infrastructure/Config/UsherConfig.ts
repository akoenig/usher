import { FileSystem } from "@effect/platform";
import { Cause, Config, ConfigError, Effect, Option, Schema } from "effect";
import * as ParseResult from "effect/ParseResult";
import {
  decodeEncryptionKeyContents,
  validateEncryptionKeyFileStat,
} from "../Encryption/KeyFile.js";

export const DefaultUsherPort = 3000;

const UsherPort = Schema.Number.pipe(Schema.int(), Schema.between(1, 65535));

export const UsherConfig = Schema.Struct({
  databasePath: Schema.NonEmptyString,
  encryptionKey: Schema.Uint8ArrayFromSelf,
  baseUrl: Schema.NonEmptyString,
  allowedCallerIps: Schema.Array(Schema.String),
  port: UsherPort,
});
export type UsherConfig = Schema.Schema.Type<typeof UsherConfig>;

const UsherConfigFile = Schema.Struct({
  databasePath: Schema.NonEmptyString,
  encryptionKey: Schema.NonEmptyString,
  baseUrl: Schema.NonEmptyString,
  allowedCallerIps: Schema.Array(Schema.String),
  port: Schema.optional(UsherPort),
});

const UsherConfigEnvironment = Schema.Struct({
  databasePath: Schema.optional(Schema.NonEmptyString),
  encryptionKey: Schema.optional(Schema.NonEmptyString),
  baseUrl: Schema.optional(Schema.NonEmptyString),
  allowedCallerIps: Schema.optional(Schema.Array(Schema.String)),
  port: Schema.optional(UsherPort),
});

type UsherConfigFile = Schema.Schema.Type<typeof UsherConfigFile>;
type UsherConfigEnvironment = Schema.Schema.Type<typeof UsherConfigEnvironment>;

export function defaultUsherConfigPath(homeDirectory: string) {
  return `${homeDirectory}/.config/usher/config.json`;
}

export const loadUsherConfig = Effect.gen(function* () {
  const homeDirectory = yield* Config.nonEmptyString("HOME");
  const fs = yield* FileSystem.FileSystem;
  const configPath = defaultUsherConfigPath(homeDirectory);
  yield* validateConfigFileStat(fs, configPath);
  const configText = yield* fs
    .readFileString(configPath)
    .pipe(
      Effect.mapError((error) =>
        ConfigError.SourceUnavailable([configPath], String(error), Cause.fail(error)),
      ),
    );
  const fileConfig = yield* decodeConfigFile(configText, configPath);
  const environmentConfig = yield* loadEnvironmentConfig;

  return yield* mergeConfig(fileConfig, environmentConfig, configPath);
});

const loadEnvironmentConfig = Config.all({
  databasePath: Config.option(Config.nonEmptyString("USHER_DATABASE_PATH")),
  encryptionKey: Config.option(Config.nonEmptyString("USHER_ENCRYPTION_KEY")),
  baseUrl: Config.option(Config.nonEmptyString("USHER_BASE_URL")),
  allowedCallerIps: Config.option(
    Config.string("USHER_ALLOWED_CALLER_IPS").pipe(Config.map(parseAllowedCallerIps)),
  ),
  port: Config.option(Config.port("USHER_PORT")),
}).pipe(
  Effect.map((config) => ({
    databasePath: Option.getOrUndefined(config.databasePath),
    encryptionKey: Option.getOrUndefined(config.encryptionKey),
    baseUrl: Option.getOrUndefined(config.baseUrl),
    allowedCallerIps: Option.getOrUndefined(config.allowedCallerIps),
    port: Option.getOrUndefined(config.port),
  })),
  Effect.flatMap(Schema.decodeUnknown(UsherConfigEnvironment)),
);

function decodeConfigFile(configText: string, configPath: string) {
  return Effect.try({
    try: (): unknown => JSON.parse(configText),
    catch: (error) => ConfigError.InvalidData([configPath], String(error)),
  }).pipe(
    Effect.flatMap((config) =>
      Schema.decodeUnknown(UsherConfigFile)(config).pipe(
        Effect.mapError((error) =>
          ConfigError.InvalidData([configPath], ParseResult.TreeFormatter.formatErrorSync(error)),
        ),
      ),
    ),
  );
}

function mergeConfig(
  fileConfig: UsherConfigFile,
  environmentConfig: UsherConfigEnvironment,
  configPath: string,
): Effect.Effect<UsherConfig, ConfigError.ConfigError> {
  const rawConfig = {
    databasePath: environmentConfig.databasePath ?? fileConfig.databasePath,
    encryptionKey: environmentConfig.encryptionKey ?? fileConfig.encryptionKey,
    baseUrl: environmentConfig.baseUrl ?? fileConfig.baseUrl,
    allowedCallerIps: environmentConfig.allowedCallerIps ?? fileConfig.allowedCallerIps,
    port: environmentConfig.port ?? fileConfig.port ?? DefaultUsherPort,
  };

  return decodeEncryptionKeyContents(rawConfig.encryptionKey).pipe(
    Effect.mapError((error) =>
      ConfigError.InvalidData([configPath, "encryptionKey"], error.message),
    ),
    Effect.flatMap((encryptionKey) =>
      Schema.decodeUnknown(UsherConfig)({
        ...rawConfig,
        encryptionKey,
      }).pipe(
        Effect.mapError((error) =>
          ConfigError.InvalidData([], ParseResult.TreeFormatter.formatErrorSync(error)),
        ),
      ),
    ),
  );
}

function parseAllowedCallerIps(value: string) {
  return value
    .split(",")
    .map((ip) => ip.trim())
    .filter((ip) => ip !== "");
}

function validateConfigFileStat(fs: FileSystem.FileSystem, configPath: string) {
  return Effect.gen(function* () {
    const fileStat = yield* fs
      .stat(configPath)
      .pipe(
        Effect.mapError((error) =>
          ConfigError.SourceUnavailable([configPath], String(error), Cause.fail(error)),
        ),
      );
    const ownerUserId = yield* Option.match(fileStat.uid, {
      onNone: () => Effect.fail(ConfigError.InvalidData([configPath], "missing owner")),
      onSome: (uid) => Effect.succeed(uid),
    });

    yield* validateEncryptionKeyFileStat({
      ownerUserId,
      mode: fileStat.mode,
      processUserId: getEffectiveUserId(),
    }).pipe(Effect.mapError((error) => ConfigError.InvalidData([configPath], error.message)));
  });
}

function getEffectiveUserId() {
  if (typeof process.geteuid !== "function") {
    return undefined;
  }

  return process.geteuid();
}
