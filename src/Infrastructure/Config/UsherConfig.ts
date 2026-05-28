import { FileSystem } from "@effect/platform";
import { Cause, Config, ConfigError, Effect, Option, Schema } from "effect";
import * as ParseResult from "effect/ParseResult";

export const DefaultUsherPort = 3000;

const UsherPort = Schema.Number.pipe(Schema.int(), Schema.between(1, 65535));

export const UsherConfig = Schema.Struct({
  databasePath: Schema.NonEmptyString,
  encryptionKeyFile: Schema.NonEmptyString,
  baseUrl: Schema.NonEmptyString,
  allowedCallerIps: Schema.Array(Schema.String),
  port: UsherPort,
});
export type UsherConfig = Schema.Schema.Type<typeof UsherConfig>;

const UsherConfigFile = Schema.Struct({
  databasePath: Schema.NonEmptyString,
  encryptionKeyFile: Schema.NonEmptyString,
  baseUrl: Schema.NonEmptyString,
  allowedCallerIps: Schema.Array(Schema.String),
  port: Schema.optional(UsherPort),
});

const UsherConfigEnvironment = Schema.Struct({
  databasePath: Schema.optional(Schema.NonEmptyString),
  encryptionKeyFile: Schema.optional(Schema.NonEmptyString),
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
  const configText = yield* fs
    .readFileString(configPath)
    .pipe(
      Effect.mapError((error) =>
        ConfigError.SourceUnavailable([configPath], String(error), Cause.fail(error)),
      ),
    );
  const fileConfig = yield* decodeConfigFile(configText, configPath);
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
